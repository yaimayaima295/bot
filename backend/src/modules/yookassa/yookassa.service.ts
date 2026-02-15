/**
 * ЮKassa API — создание платежа (redirect на страницу оплаты).
 * Документация: https://yookassa.ru/developers/api#create_payment
 */

const YOOKASSA_API = "https://api.yookassa.ru/v3";

export type CreatePaymentParams = {
  shopId: string;
  secretKey: string;
  amount: number;
  currency: string;
  returnUrl: string;
  description: string;
  metadata: Record<string, string>;
  /** Email покупателя для чека 54-ФЗ (обязателен при включённых чеках в ЮKassa) */
  customerEmail?: string | null;
};

export type CreatePaymentResult =
  | { ok: true; paymentId: string; confirmationUrl: string; status: string }
  | { ok: false; error: string; status?: number };

/**
 * Создаёт платёж в ЮKassa. Возвращает confirmation_url для редиректа пользователя.
 * Idempotence-Key: генерируется из metadata.payment_id + timestamp для уникальности.
 */
export async function createYookassaPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
  const { shopId, secretKey, amount, currency, returnUrl, description, metadata, customerEmail } = params;
  if (!shopId?.trim() || !secretKey?.trim()) {
    return { ok: false, error: "YooKassa not configured" };
  }

  const valueStr = amount.toFixed(2);
  const currencyUpper = currency.toUpperCase();

  // Чек 54-ФЗ (обязателен, если в ЛК ЮKassa включены «Чеки от ЮKassa»)
  const receipt = {
    customer: {
      email: (customerEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail))
        ? customerEmail.trim()
        : "noreply@receipt.stealthnet.local",
    },
    items: [
      {
        description: description.slice(0, 128) || "Оплата подписки",
        quantity: "1.00",
        amount: { value: valueStr, currency: currencyUpper },
        vat_code: 1, // Без НДС
        payment_subject: "service" as const,
        payment_mode: "full_payment" as const,
      },
    ],
  };

  const body = {
    amount: { value: valueStr, currency: currencyUpper },
    capture: true,
    confirmation: { type: "redirect" as const, return_url: returnUrl },
    description: description.slice(0, 128),
    metadata,
    receipt,
  };

  const idempotenceKey = `${metadata.payment_id ?? "pay"}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const auth = Buffer.from(`${shopId.trim()}:${secretKey.trim()}`).toString("base64");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${YOOKASSA_API}/payments`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Idempotence-Key": idempotenceKey,
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(body),
    });
    clearTimeout(timeoutId);

    let data: {
      id?: string;
      status?: string;
      confirmation?: { confirmation_url?: string };
      description?: string;
      code?: string;
      parameter?: string;
      [key: string]: unknown;
    };
    try {
      data = (await res.json()) as typeof data;
    } catch {
      return { ok: false, error: `YooKassa: ответ не JSON (${res.status})`, status: res.status };
    }

    if (!res.ok) {
      const parts = [data.description ?? data.code ?? res.statusText ?? "YooKassa error"];
      if (data.parameter) parts.push(`Параметр: ${data.parameter}`);
      return { ok: false, error: parts.join(". "), status: res.status };
    }

    const confirmationUrl = data.confirmation?.confirmation_url;
    if (!data.id || !confirmationUrl) {
      return { ok: false, error: "No id or confirmation_url in response" };
    }

    return {
      ok: true,
      paymentId: data.id,
      confirmationUrl,
      status: data.status ?? "pending",
    };
  } catch (e) {
    clearTimeout(timeoutId);
    const message = e instanceof Error ? e.message : String(e);
    const isNetwork =
      message === "fetch failed" ||
      message.includes("ECONNREFUSED") ||
      message.includes("ENOTFOUND") ||
      message.includes("ETIMEDOUT") ||
      message.includes("network") ||
      (e instanceof Error && e.name === "AbortError");
    if (isNetwork) {
      return {
        ok: false,
        error:
          "Сервер не может подключиться к ЮKassa (api.yookassa.ru). Проверьте доступ в интернет, firewall и DNS на сервере.",
      };
    }
    return { ok: false, error: message };
  }
}

export function isYookassaConfigured(shopId: string | null, secretKey: string | null): boolean {
  return Boolean(shopId?.trim() && secretKey?.trim());
}
