import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth";
import { api, type AdminSettings } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Megaphone,
  Link2,
  BarChart3,
  Target,
  Copy,
  Check,
  ExternalLink,
  Info,
  TrendingUp,
  Loader2,
} from "lucide-react";

type CampaignsStatsRow = { source: string; campaign: string | null; registrations: number; trials: number; payments: number; revenue: number };

function fmt(n: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}
function fmtDec(n: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n);
}
function CopyButton({ text, label = "Копировать" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button type="button" variant="outline" size="sm" onClick={copy} className="shrink-0">
      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-5" />}
      <span className="ml-1.5">{copied ? "Скопировано" : label}</span>
    </Button>
  );
}

function LinkRow({ title, href, description }: { title: string; href: string; description?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-2 border-b border-border/60 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm">{title}</p>
        {description ? <p className="text-xs text-muted-foreground mt-0.5">{description}</p> : null}
        <p className="text-xs font-mono text-muted-foreground truncate mt-1" title={href}>{href}</p>
      </div>
      <div className="flex gap-2 shrink-0">
        <CopyButton text={href} />
        <Button variant="ghost" size="sm" asChild>
          <a href={href} target="_blank" rel="noopener noreferrer" title="Открыть">
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
      </div>
    </div>
  );
}

export function MarketingPage() {
  const { state } = useAuth();
  const token = state.accessToken;
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [gaId, setGaId] = useState("");
  const [ymId, setYmId] = useState("");
  const [campaignsStats, setCampaignsStats] = useState<CampaignsStatsRow[] | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.getSettings(token).then((s) => {
      setSettings(s);
      setGaId(s.googleAnalyticsId ?? "");
      setYmId(s.yandexMetrikaId ?? "");
    }).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    api.getAnalytics(token).then((data) => {
      setCampaignsStats(data.campaignsStats ?? []);
    }).catch(() => setCampaignsStats([])).finally(() => setAnalyticsLoading(false));
  }, [token]);

  const saveAnalyticsIds = async () => {
    if (!token) return;
    setSaving(true);
    setMessage("");
    try {
      const updated = await api.updateSettings(token, {
        googleAnalyticsId: gaId.trim() || null,
        yandexMetrikaId: ymId.trim() || null,
      });
      setSettings(updated);
      setGaId(updated.googleAnalyticsId ?? "");
      setYmId(updated.yandexMetrikaId ?? "");
      setMessage("Настройки сохранены.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const baseUrl = (settings.publicAppUrl ?? "").replace(/\/$/, "") || "https://ваш-сайт.ru";
  const botUsername = settings.telegramBotUsername?.replace(/^@/, "") ?? "ваш_бот";
  const botUrl = `https://t.me/${botUsername}`;

  return (
    <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Megaphone className="h-7 w-7 text-primary" />
            Маркетинг и аналитика
          </h1>
          <p className="text-muted-foreground mt-1">
            Настройки отслеживания источников трафика (UTM), счётчики и полезные ссылки для рекламы.
          </p>
        </div>

        {/* ─── Полезные ссылки ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Полезные ссылки
            </CardTitle>
            <CardDescription>
              Основные ссылки для рассылок, рекламы и шаблоны с UTM. Подставьте свой реферальный код или параметры кампании.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-0">
            <LinkRow
              title="Кабинет — вход"
              href={`${baseUrl}/cabinet/login`}
              description="Страница входа в личный кабинет"
            />
            <LinkRow
              title="Кабинет — регистрация"
              href={`${baseUrl}/cabinet/register`}
              description="Страница регистрации новых пользователей"
            />
            <LinkRow
              title="Бот (старт)"
              href={`${botUrl}?start=`}
              description="Ссылка на бота без параметров"
            />
            <LinkRow
              title="Реферальная ссылка (шаблон)"
              href={`${baseUrl}/cabinet/register?ref=КОД_РЕФЕРАЛА`}
              description="Замените КОД_РЕФЕРАЛА на реферальный код клиента из раздела «Рефералы»"
            />
            <LinkRow
              title="Регистрация с UTM (шаблон)"
              href={`${baseUrl}/cabinet/register?utm_source=SOURCE&utm_medium=MEDIUM&utm_campaign=CAMPAIGN`}
              description="Пример: utm_source=facebook, utm_campaign=winter"
            />
            <LinkRow
              title="Бот — кампания (шаблон)"
              href={`${botUrl}?start=c_источник_кампания`}
              description="Пример: start=c_facebook_winter (источник_кампания)"
            />
            <LinkRow
              title="Бот — реферал + кампания (шаблон)"
              href={`${botUrl}?start=ref_КОД_c_источник_кампания`}
              description="Реферальный код и метка кампании в одной ссылке"
            />
          </CardContent>
        </Card>

        {/* ─── Готовые ссылки с UTM ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Готовые ссылки с UTM
            </CardTitle>
            <CardDescription>
              Примеры ссылок с подставленными UTM-метками для разных каналов. Копируйте и при необходимости меняйте название кампании.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-0">
            <p className="text-sm font-medium text-muted-foreground mb-3">Кабинет — регистрация</p>
            <LinkRow
              title="Facebook / Meta"
              href={`${baseUrl}/cabinet/register?utm_source=facebook&utm_medium=cpc&utm_campaign=winter`}
              description="utm_source=facebook, utm_medium=cpc"
            />
            <LinkRow
              title="VK Реклама"
              href={`${baseUrl}/cabinet/register?utm_source=vk&utm_medium=cpc&utm_campaign=winter`}
              description="utm_source=vk, utm_medium=cpc"
            />
            <LinkRow
              title="Instagram"
              href={`${baseUrl}/cabinet/register?utm_source=instagram&utm_medium=stories&utm_campaign=winter`}
              description="utm_source=instagram, utm_medium=stories"
            />
            <LinkRow
              title="Email-рассылка"
              href={`${baseUrl}/cabinet/register?utm_source=email&utm_medium=newsletter&utm_campaign=winter`}
              description="utm_source=email, utm_medium=newsletter"
            />
            <LinkRow
              title="Telegram-канал / пост"
              href={`${baseUrl}/cabinet/register?utm_source=telegram&utm_medium=channel&utm_campaign=winter`}
              description="utm_source=telegram, utm_medium=channel"
            />
            <LinkRow
              title="Блогер / партнёр"
              href={`${baseUrl}/cabinet/register?utm_source=blogger&utm_medium=partner&utm_campaign=winter`}
              description="utm_source=blogger, utm_medium=partner"
            />
            <p className="text-sm font-medium text-muted-foreground mt-6 mb-3">Бот — старт с меткой кампании</p>
            <LinkRow
              title="Бот — Facebook"
              href={`${botUrl}?start=c_facebook_winter`}
              description="источник_кампания"
            />
            <LinkRow
              title="Бот — VK"
              href={`${botUrl}?start=c_vk_winter`}
              description="источник_кампания"
            />
            <LinkRow
              title="Бот — Instagram"
              href={`${botUrl}?start=c_instagram_winter`}
              description="источник_кампания"
            />
            <LinkRow
              title="Бот — Email"
              href={`${botUrl}?start=c_email_newsletter`}
              description="источник_кампания"
            />
            <LinkRow
              title="Бот — Telegram-канал"
              href={`${botUrl}?start=c_telegram_channel`}
              description="источник_кампания"
            />
          </CardContent>
        </Card>

        {/* ─── UTM и источники трафика ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Отслеживание источников (UTM)
            </CardTitle>
            <CardDescription>
              Система запоминает, откуда пришёл пользователь (реклама, рассылка, блогер), и привязывает это к регистрации и платежам.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-2">
              <p className="font-medium flex items-center gap-1.5">
                <Info className="h-4 w-4 text-primary" />
                Как это работает
              </p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li><strong>Сайт:</strong> добавьте к ссылке на кабинет параметры <code className="bg-muted px-1 rounded">utm_source</code>, <code className="bg-muted px-1 rounded">utm_campaign</code> (и при необходимости <code className="bg-muted px-1 rounded">utm_medium</code>, <code className="bg-muted px-1 rounded">utm_content</code>, <code className="bg-muted px-1 rounded">utm_term</code>). При первом заходе они сохраняются и привязываются к аккаунту при регистрации.</li>
                <li><strong>Бот:</strong> используйте ссылку вида <code className="bg-muted px-1 rounded">t.me/бот?start=c_источник_кампания</code> (например <code className="bg-muted px-1 rounded">c_facebook_winter</code>). Можно комбинировать с рефералом: <code className="bg-muted px-1 rounded">ref_КОД_c_источник_кампания</code>.</li>
                <li>Итоги по источникам отображаются в блоке ниже (и в разделе <strong>Аналитика</strong>).</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* ─── Аналитика по источникам (UTM) ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Аналитика по источникам (UTM)
            </CardTitle>
            <CardDescription>
              Регистрации, триалы, платежи и доход по каждому источнику трафика (данные за 90 дней).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {analyticsLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Загрузка…</span>
              </div>
            ) : !campaignsStats?.length ? (
              <p className="text-sm text-muted-foreground text-center py-8 px-4">
                Нет данных по источникам. Используйте ссылки с UTM или бот с <code className="bg-muted px-1 rounded">start=c_источник_кампания</code> — после регистраций и платежей здесь появится статистика.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Источник</th>
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Кампания</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Регистрации</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Триалы</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Платежи</th>
                      <th className="text-right px-4 py-3 font-medium text-muted-foreground">Доход</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignsStats.map((row, i) => (
                      <tr key={i} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-medium">{row.source}</td>
                        <td className="px-4 py-3 text-muted-foreground">{row.campaign ?? "—"}</td>
                        <td className="px-4 py-3 text-right">{fmt(row.registrations)}</td>
                        <td className="px-4 py-3 text-right">{fmt(row.trials)}</td>
                        <td className="px-4 py-3 text-right">{fmt(row.payments)}</td>
                        <td className="px-4 py-3 text-right font-medium text-green-600 dark:text-green-400">{fmtDec(row.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── Google Analytics ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Google Analytics 4
            </CardTitle>
            <CardDescription>
              Укажите Measurement ID (формат G-XXXXXXXXXX). Счётчик будет автоматически подключён на страницах кабинета (вход, регистрация, личный кабинет).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 max-w-md">
              <Label htmlFor="ga-id">Measurement ID (G-XXXXXXXXXX)</Label>
              <Input
                id="ga-id"
                placeholder="G-XXXXXXXXXX"
                value={gaId}
                onChange={(e) => setGaId(e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Настройка → Данные → Потоки данных → Веб → Идентификатор измерения.
              </p>
            </div>
            <Button onClick={saveAnalyticsIds} disabled={saving}>
              {saving ? "Сохранение…" : "Сохранить"}
            </Button>
          </CardContent>
        </Card>

        {/* ─── Яндекс.Метрика ─── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Яндекс.Метрика
            </CardTitle>
            <CardDescription>
              Укажите номер счётчика (число). Код счётчика будет автоматически подключён на страницах кабинета.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 max-w-md">
              <Label htmlFor="ym-id">Номер счётчика</Label>
              <Input
                id="ym-id"
                type="text"
                inputMode="numeric"
                placeholder="12345678"
                value={ymId}
                onChange={(e) => setYmId(e.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Создайте счётчик в <a href="https://metrika.yandex.ru" target="_blank" rel="noopener noreferrer" className="text-primary underline">Яндекс.Метрике</a>, скопируйте номер в настройках счётчика.
              </p>
            </div>
            <Button onClick={saveAnalyticsIds} disabled={saving}>
              {saving ? "Сохранение…" : "Сохранить"}
            </Button>
          </CardContent>
        </Card>

        {message ? (
          <p className={message.startsWith("Ошибка") ? "text-destructive text-sm" : "text-green-600 dark:text-green-400 text-sm"}>
            {message}
          </p>
        ) : null}
      </div>
  );
}
