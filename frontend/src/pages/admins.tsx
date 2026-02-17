import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth";
import { api, type AdminListItem, MANAGER_SECTIONS } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { UserCog, Plus, Pencil, Trash2, Loader2 } from "lucide-react";

export function AdminsPage() {
  const { state } = useAuth();
  const token = state.accessToken;
  const [list, setList] = useState<AdminListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [allowedSections, setAllowedSections] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.getAdmins(token).then(setList).catch(() => setError("Нет доступа")).finally(() => setLoading(false));
  }, [token]);

  function openCreate() {
    setModal("create");
    setEditingId(null);
    setDeleteConfirm(null);
    setEmail("");
    setPassword("");
    setAllowedSections([]);
  }

  function openEdit(item: AdminListItem) {
    if (item.role === "ADMIN") return;
    setModal("edit");
    setEditingId(item.id);
    setDeleteConfirm(null);
    setEmail(item.email);
    setPassword("");
    setAllowedSections(item.allowedSections ?? []);
  }

  function toggleSection(key: string) {
    setAllowedSections((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]
    );
  }

  async function handleCreate() {
    if (!token || !email.trim() || !password) {
      setError("Укажите email и пароль (мин. 8 символов)");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const created = await api.createManager(token, {
        email: email.trim(),
        password,
        allowedSections,
      });
      setList((prev) => [created, ...prev]);
      setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка создания");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!token || !editingId) return;
    setSaving(true);
    setError("");
    try {
      const updated = await api.updateManager(token, editingId, {
        allowedSections,
        ...(password.trim() ? { password: password.trim() } : {}),
      });
      setList((prev) => prev.map((a) => (a.id === editingId ? { ...a, ...updated } : a)));
      setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!token) return;
    setSaving(true);
    setError("");
    try {
      await api.deleteManager(token, id);
      setList((prev) => prev.filter((a) => a.id !== id));
      setDeleteConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка удаления");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && list.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {error}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <UserCog className="h-7 w-7 text-primary" />
              Менеджеры
            </h1>
            <p className="text-muted-foreground mt-1">
              Создавайте менеджеров и назначайте им доступ только к нужным разделам админки.
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Добавить менеджера
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Пользователи админки</CardTitle>
            <CardDescription>
              Админ имеет полный доступ. Менеджеру доступны только выбранные при создании разделы.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium">Email</th>
                    <th className="text-left px-4 py-3 font-medium">Роль</th>
                    <th className="text-left px-4 py-3 font-medium">Разделы доступа</th>
                    <th className="w-24 px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((item) => (
                    <tr key={item.id} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{item.email}</td>
                      <td className="px-4 py-3">
                        <span className={item.role === "ADMIN" ? "text-primary font-medium" : "text-muted-foreground"}>
                          {item.role === "ADMIN" ? "Админ" : "Менеджер"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {item.role === "ADMIN"
                          ? "Все разделы"
                          : (item.allowedSections?.length
                              ? item.allowedSections
                                  .map((k) => MANAGER_SECTIONS.find((s) => s.key === k)?.label ?? k)
                                  .join(", ")
                              : "Нет доступа")}
                      </td>
                      <td className="px-4 py-3">
                        {item.role === "MANAGER" && (
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(item)} title="Изменить">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {deleteConfirm === item.id ? (
                              <>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleDelete(item.id)}
                                  disabled={saving}
                                >
                                  Да
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(null)}>
                                  Нет
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeleteConfirm(item.id)}
                                title="Удалить"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {error && modal && <p className="text-sm text-destructive">{error}</p>}

        {modal === "create" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Новый менеджер</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setModal(null)}>Закрыть</Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="manager@example.com" />
              </div>
              <div className="grid gap-2">
                <Label>Пароль (мин. 8 символов)</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </div>
              <div>
                <Label className="mb-2 block">Доступ к разделам</Label>
                <div className="flex flex-wrap gap-4">
                  {MANAGER_SECTIONS.map((s) => (
                    <label key={s.key} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={allowedSections.includes(s.key)}
                        onCheckedChange={() => toggleSection(s.key)}
                      />
                      <span className="text-sm">{s.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? "Создание…" : "Создать"}
              </Button>
            </CardContent>
          </Card>
        )}

        {modal === "edit" && editingId && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Редактировать менеджера</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setModal(null)}>Закрыть</Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label>Email</Label>
                <Input type="email" value={email} disabled className="bg-muted" />
              </div>
              <div className="grid gap-2">
                <Label>Новый пароль (оставьте пустым, чтобы не менять)</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </div>
              <div>
                <Label className="mb-2 block">Доступ к разделам</Label>
                <div className="flex flex-wrap gap-4">
                  {MANAGER_SECTIONS.map((s) => (
                    <label key={s.key} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={allowedSections.includes(s.key)}
                        onCheckedChange={() => toggleSection(s.key)}
                      />
                      <span className="text-sm">{s.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <Button onClick={handleUpdate} disabled={saving}>
                {saving ? "Сохранение…" : "Сохранить"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
  );
}
