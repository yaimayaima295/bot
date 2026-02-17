import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth";
import {
  api,
  type AutoBroadcastRule,
  type AutoBroadcastRulePayload,
  type AutoBroadcastTriggerType,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarClock, Plus, Play, Trash2, Pencil, Loader2, Clock } from "lucide-react";

const TRIGGER_LABELS: Record<AutoBroadcastTriggerType, string> = {
  after_registration: "После регистрации",
  inactivity: "Неактивность (нет оплат)",
  no_payment: "Ни разу не платил",
  trial_not_connected: "Не подключил триал",
  trial_used_never_paid: "Пользовался триалом, но не оплатил",
  no_traffic: "Подключён к VPN (напоминание)",
  subscription_expired: "Подписка истекла",
};

const CHANNEL_LABELS: Record<string, string> = {
  telegram: "Telegram",
  email: "Email",
  both: "Telegram и Email",
};

export function AutoBroadcastPage() {
  const { state } = useAuth();
  const token = state.accessToken ?? "";
  const [rules, setRules] = useState<AutoBroadcastRule[]>([]);
  const [eligibleCounts, setEligibleCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [runAllLoading, setRunAllLoading] = useState(false);
  const [runningRuleId, setRunningRuleId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AutoBroadcastRulePayload>({
    name: "",
    triggerType: "after_registration",
    delayDays: 1,
    channel: "telegram",
    subject: "",
    message: "",
    enabled: true,
  });
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [scheduleCron, setScheduleCron] = useState("");
  const [scheduleSaving, setScheduleSaving] = useState(false);

  function loadRules() {
    if (!token) return;
    setLoading(true);
    api
      .getAutoBroadcastRules(token)
      .then((list) => {
        setRules(list);
        return list;
      })
      .then((list) => {
        const counts: Record<string, number> = {};
        Promise.all(
          list.map((r) =>
            api.getAutoBroadcastEligibleCount(token, r.id).then(({ count }) => {
              counts[r.id] = count;
            })
          )
        ).then(() => setEligibleCounts(counts));
      })
      .catch(() => setRules([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadRules();
  }, [token]);

  useEffect(() => {
    if (token) {
      api.getSettings(token).then((s) => setScheduleCron(s.autoBroadcastCron ?? "")).catch(() => {});
    }
  }, [token]);

  async function handleSaveSchedule(e: React.FormEvent) {
    e.preventDefault();
    setScheduleSaving(true);
    try {
      await api.updateSettings(token, { autoBroadcastCron: scheduleCron.trim() || null });
    } catch {
      // ignore
    } finally {
      setScheduleSaving(false);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm({
      name: "",
      triggerType: "after_registration",
      delayDays: 1,
      channel: "telegram",
      subject: "",
      message: "",
      enabled: true,
    });
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(rule: AutoBroadcastRule) {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      triggerType: rule.triggerType,
      delayDays: rule.delayDays,
      channel: rule.channel,
      subject: rule.subject ?? "",
      message: rule.message,
      enabled: rule.enabled,
    });
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const payload: AutoBroadcastRulePayload = {
      ...form,
      subject: form.subject?.trim() || null,
    };
    if (!payload.name.trim()) {
      setFormError("Укажите название правила");
      return;
    }
    if (!payload.message.trim()) {
      setFormError("Укажите текст сообщения");
      return;
    }
    setFormSaving(true);
    try {
      if (editingId) {
        await api.updateAutoBroadcastRule(token, editingId, payload);
      } else {
        await api.createAutoBroadcastRule(token, payload);
      }
      closeForm();
      loadRules();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setFormSaving(false);
    }
  }

  async function handleDelete(ruleId: string) {
    if (!confirm("Удалить правило?")) return;
    try {
      await api.deleteAutoBroadcastRule(token, ruleId);
      loadRules();
    } catch {
      // ignore
    }
  }

  async function handleRunAll() {
    setRunAllLoading(true);
    try {
      const { results } = await api.runAutoBroadcastAll(token);
      const ok = results.every((r) => r.errors.length === 0);
      if (ok) loadRules();
      else alert(results.map((r) => `Правило ${r.ruleId}: ${r.errors.join("; ")}`).join("\n"));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка запуска");
    } finally {
      setRunAllLoading(false);
    }
  }

  async function handleRunOne(ruleId: string) {
    setRunningRuleId(ruleId);
    try {
      const result = await api.runAutoBroadcastRule(token, ruleId);
      if (result.errors.length > 0) alert(result.errors.join("; "));
      else loadRules();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка запуска");
    } finally {
      setRunningRuleId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Авто-рассылка</h1>
          <p className="text-muted-foreground">
            Настраиваемые правила: после регистрации, неактивность, без платежа — чтобы не терять клиентов
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleRunAll} disabled={runAllLoading || rules.length === 0}>
            {runAllLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Запустить все
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Добавить правило
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Расписание
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Cron: минута час день месяц день_недели. Например <code className="rounded bg-muted px-1">0 9 * * *</code> — каждый день в 9:00. Пусто = по умолчанию 9:00.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveSchedule} className="flex flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1 space-y-2">
              <Label htmlFor="schedule-cron">Выражение cron</Label>
              <Input
                id="schedule-cron"
                value={scheduleCron}
                onChange={(e) => setScheduleCron(e.target.value)}
                placeholder="0 9 * * *"
                className="font-mono"
              />
            </div>
            <Button type="submit" disabled={scheduleSaving}>
              {scheduleSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Сохранить расписание
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            Правила
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-8">
              <Loader2 className="h-5 w-5 animate-spin" />
              Загрузка…
            </div>
          ) : rules.length === 0 ? (
            <p className="text-muted-foreground py-6">Правил пока нет. Добавьте первое.</p>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{rule.name}</span>
                      {!rule.enabled && (
                        <span className="rounded bg-muted px-2 py-0.5 text-xs">выкл</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {TRIGGER_LABELS[rule.triggerType]} · через {rule.delayDays} дн. · {CHANNEL_LABELS[rule.channel]}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Отправлено: {rule.sentCount ?? 0} · Сейчас подходят: {eligibleCounts[rule.id] ?? "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRunOne(rule.id)}
                      disabled={runningRuleId !== null}
                    >
                      {runningRuleId === rule.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      Запустить
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(rule)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(rule.id)} className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showForm && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{editingId ? "Редактировать правило" : "Новое правило"}</CardTitle>
            <Button variant="ghost" size="sm" onClick={closeForm}>
              Закрыть
            </Button>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              {formError && (
                <p className="text-sm text-destructive rounded bg-destructive/10 px-3 py-2">{formError}</p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Название</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Например: Напоминание через 3 дня"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Триггер</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    value={form.triggerType}
                    onChange={(e) => setForm((f) => ({ ...f, triggerType: e.target.value as AutoBroadcastTriggerType }))}
                  >
                    {(Object.keys(TRIGGER_LABELS) as AutoBroadcastTriggerType[]).map((t) => (
                      <option key={t} value={t}>
                        {TRIGGER_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Через сколько дней (0–365)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={365}
                    value={form.delayDays}
                    onChange={(e) => setForm((f) => ({ ...f, delayDays: Math.max(0, Math.min(365, Number(e.target.value) || 0)) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Канал</Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    value={form.channel}
                    onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value as "telegram" | "email" | "both" }))}
                  >
                    <option value="telegram">Telegram</option>
                    <option value="email">Email</option>
                    <option value="both">Telegram и Email</option>
                  </select>
                </div>
              </div>
              {(form.channel === "email" || form.channel === "both") && (
                <div className="space-y-2">
                  <Label>Тема письма (для email)</Label>
                  <Input
                    value={form.subject ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                    placeholder="Тема письма"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Текст сообщения</Label>
                <textarea
                  className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  value={form.message}
                  onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                  placeholder="Текст для Telegram / email (до 4096 символов)"
                  maxLength={4096}
                />
                <p className="text-xs text-muted-foreground">{form.message.length} / 4096</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="form-enabled"
                  checked={form.enabled}
                  onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                  className="rounded border-input"
                />
                <Label htmlFor="form-enabled">Включено (участвует в запуске «Запустить все»)</Label>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={formSaving}>
                  {formSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {editingId ? "Сохранить" : "Создать"}
                </Button>
                <Button type="button" variant="outline" onClick={closeForm}>
                  Отмена
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
