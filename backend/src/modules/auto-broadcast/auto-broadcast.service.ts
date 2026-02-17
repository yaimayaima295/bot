/**
 * Авто-рассылка: настраиваемые правила (после регистрации, неактивность, без платежа).
 * Джоб выбирает подходящих клиентов, отправляет сообщение и пишет лог.
 */

import { prisma } from "../../db.js";
import { getSystemConfig } from "../client/client.service.js";
import { sendEmail } from "../mail/mail.service.js";

const TELEGRAM_DELAY_MS = 60;
const EMAIL_DELAY_MS = 200;

export type TriggerType =
  | "after_registration"
  | "inactivity"
  | "no_payment"
  | "trial_not_connected"      // зарегистрирован N дней, триал не подключал
  | "trial_used_never_paid"    // пользовался триалом, но ни разу не платил
  | "no_traffic"               // подключён к VPN N дней, напоминание (без данных Remna о трафике — по delayDays)
  | "subscription_expired";    // подписка истекла (последний PAID оплачен, но срок вышел)

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendTelegram(botToken: string, chatId: string, text: string): Promise<boolean> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
    return Boolean(res.ok && data.ok);
  } catch {
    return false;
  }
}

/**
 * Получить ID клиентов, подходящих под правило (ещё не получали это правило).
 */
export async function getEligibleClientIds(ruleId: string): Promise<string[]> {
  const rule = await prisma.autoBroadcastRule.findUnique({
    where: { id: ruleId, enabled: true },
  });
  if (!rule) return [];

  const alreadySent = await prisma.autoBroadcastLog.findMany({
    where: { ruleId },
    select: { clientId: true },
  });
  const sentSet = new Set(alreadySent.map((l) => l.clientId));

  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;

  let clients: { id: string }[] = [];

  if (rule.triggerType === "after_registration") {
    const from = new Date(now.getTime() - (rule.delayDays + 1) * dayMs);
    const to = new Date(now.getTime() - rule.delayDays * dayMs);
    clients = await prisma.client.findMany({
      where: { createdAt: { gte: from, lt: to }, isBlocked: false },
      select: { id: true },
    });
  } else if (rule.triggerType === "inactivity") {
    const since = new Date(now.getTime() - rule.delayDays * dayMs);
    const paidClientIds = await prisma.payment.findMany({
      where: { status: "PAID", paidAt: { gte: since } },
      select: { clientId: true },
      distinct: ["clientId"],
    });
    const activeSet = new Set(paidClientIds.map((p) => p.clientId));
    const all = await prisma.client.findMany({
      where: { isBlocked: false, createdAt: { lt: since } },
      select: { id: true },
    });
    clients = all.filter((c) => !activeSet.has(c.id));
  } else if (rule.triggerType === "no_payment") {
    const from = new Date(now.getTime() - (rule.delayDays + 1) * dayMs);
    const to = new Date(now.getTime() - rule.delayDays * dayMs);
    const neverPaid = await prisma.client.findMany({
      where: {
        isBlocked: false,
        createdAt: { gte: from, lt: to },
        payments: { none: { status: "PAID" } },
      },
      select: { id: true },
    });
    clients = neverPaid;
  } else if (rule.triggerType === "trial_not_connected") {
    const since = new Date(now.getTime() - rule.delayDays * dayMs);
    clients = await prisma.client.findMany({
      where: {
        isBlocked: false,
        createdAt: { lt: since },
        trialUsed: false,
        remnawaveUuid: null,
      },
      select: { id: true },
    });
  } else if (rule.triggerType === "trial_used_never_paid") {
    clients = await prisma.client.findMany({
      where: {
        isBlocked: false,
        trialUsed: true,
        payments: { none: { status: "PAID" } },
      },
      select: { id: true },
    });
  } else if (rule.triggerType === "no_traffic") {
    const since = new Date(now.getTime() - rule.delayDays * dayMs);
    clients = await prisma.client.findMany({
      where: {
        isBlocked: false,
        remnawaveUuid: { not: null },
        createdAt: { lt: since },
      },
      select: { id: true },
    });
  } else if (rule.triggerType === "subscription_expired") {
    const paidWithTariff = await prisma.payment.findMany({
      where: { status: "PAID", tariffId: { not: null }, paidAt: { not: null } },
      select: { clientId: true, paidAt: true, tariff: { select: { durationDays: true } } },
      orderBy: { paidAt: "desc" },
    });
    const clientLastExpire = new Map<string, Date>();
    for (const p of paidWithTariff) {
      if (p.clientId && p.paidAt && p.tariff?.durationDays != null && !clientLastExpire.has(p.clientId)) {
        const expireAt = new Date(p.paidAt.getTime() + p.tariff.durationDays * dayMs);
        clientLastExpire.set(p.clientId, expireAt);
      }
    }
    const expiredClientIds = new Set<string>();
    for (const [clientId, expireAt] of clientLastExpire) {
      if (expireAt < now && (rule.delayDays === 0 || expireAt <= new Date(now.getTime() - rule.delayDays * dayMs))) {
        expiredClientIds.add(clientId);
      }
    }
    const blockedSet = new Set(
      (await prisma.client.findMany({ where: { isBlocked: true }, select: { id: true } })).map((c) => c.id)
    );
    clients = Array.from(expiredClientIds)
      .filter((id) => !blockedSet.has(id))
      .map((id) => ({ id }));
  }

  return clients.map((c) => c.id).filter((id) => !sentSet.has(id));
}

export type RunRuleResult = {
  ruleId: string;
  ruleName: string;
  sent: number;
  errors: string[];
};

/**
 * Выполнить одно правило: отправить сообщение подходящим клиентам и записать лог.
 */
export async function runRule(ruleId: string): Promise<RunRuleResult> {
  const rule = await prisma.autoBroadcastRule.findUnique({ where: { id: ruleId } });
  if (!rule) return { ruleId, ruleName: "", sent: 0, errors: ["Rule not found"] };
  if (!rule.enabled) return { ruleId, ruleName: rule.name, sent: 0, errors: [] };

  const clientIds = await getEligibleClientIds(ruleId);
  if (clientIds.length === 0) return { ruleId, ruleName: rule.name, sent: 0, errors: [] };

  const config = await getSystemConfig();
  const doTelegram = rule.channel === "telegram" || rule.channel === "both";
  const doEmail = rule.channel === "email" || rule.channel === "both";
  const botToken = config.telegramBotToken?.trim();
  const smtpConfig = doEmail
    ? {
        host: config.smtpHost || "",
        port: config.smtpPort ?? 587,
        secure: config.smtpSecure ?? false,
        user: config.smtpUser ?? null,
        password: config.smtpPassword ?? null,
        fromEmail: config.smtpFromEmail ?? null,
        fromName: config.smtpFromName ?? null,
      }
    : null;
  const serviceName = config.serviceName || "Сервис";
  const subject = rule.subject?.trim() || `Сообщение от ${serviceName}`;
  const htmlMessage = rule.message.trim().replace(/\n/g, "<br>\n");
  const htmlBody = `<!DOCTYPE html><html><body style="font-family: sans-serif;">${htmlMessage}</body></html>`;

  const clients = await prisma.client.findMany({
    where: { id: { in: clientIds } },
    select: { id: true, telegramId: true, email: true },
  });

  let sent = 0;
  const errors: string[] = [];

  for (const c of clients) {
    let telegramOk = false;
    let emailOk = false;
    if (doTelegram && botToken && c.telegramId?.trim()) {
      telegramOk = await sendTelegram(botToken, c.telegramId.trim(), rule.message.trim());
      if (!telegramOk && errors.length < 5) errors.push(`Telegram ${c.id}`);
      await delay(TELEGRAM_DELAY_MS);
    }
    if (doEmail && smtpConfig?.host && smtpConfig?.fromEmail && c.email?.trim()) {
      const res = await sendEmail(smtpConfig, c.email.trim(), subject, htmlBody);
      emailOk = res.ok;
      if (!emailOk && errors.length < 5) errors.push(`Email ${c.email}`);
      await delay(EMAIL_DELAY_MS);
    }
    const anySent = telegramOk || emailOk;
    if (anySent) {
      await prisma.autoBroadcastLog.create({
        data: { ruleId: rule.id, clientId: c.id },
      });
      sent++;
    }
  }

  return { ruleId, ruleName: rule.name, sent, errors };
}

/**
 * Запустить все включённые правила.
 */
export async function runAllRules(): Promise<RunRuleResult[]> {
  const rules = await prisma.autoBroadcastRule.findMany({
    where: { enabled: true },
    select: { id: true },
  });
  const results: RunRuleResult[] = [];
  for (const r of rules) {
    const res = await runRule(r.id);
    results.push(res);
  }
  return results;
}
