import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { api } from "@/lib/api/client";
import { requireIamPermission } from "@/lib/route-guards";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

const PAGE_SIZE = 10;

const consultantsSearchSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  q: z.string().catch(""),
});

export type ConsultantsSearch = z.infer<typeof consultantsSearchSchema>;

export const Route = createFileRoute("/_authenticated/consultants")({
  validateSearch: consultantsSearchSchema,
  beforeLoad: () => requireIamPermission(["consultants.read", "consultants.manage"]),
  component: ConsultantsPage,
});

type ConsultantRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  regional: string | null;
  active: boolean;
  slack_user_id?: string | null;
};

type ConsultantForm = {
  name: string;
  email: string;
  phone: string;
  regional: string;
  active: boolean;
};

const emptyForm: ConsultantForm = {
  name: "",
  email: "",
  phone: "",
  regional: "",
  active: true,
};

function ConsultantsPage() {
  const { page, q } = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const { hasPermission } = useCurrentUser();
  const canManageConsultants = hasPermission("consultants.manage");

  const [searchInput, setSearchInput] = useState(q);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<ConsultantRow | null>(null);
  const [form, setForm] = useState<ConsultantForm>(emptyForm);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; label: string } | null>(null);

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    setSelected(new Set());
  }, [page, q]);

  const offset = (page - 1) * PAGE_SIZE;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["consultants", page, q],
    queryFn: async () => {
      let query = api
        .from("consultants")
        .select("*")
        .order("name")
        .limit(PAGE_SIZE)
        .offset(offset)
        .count();
      if (q.trim()) query = query.search(q.trim());
      const { data: rows, error, count } = await query;
      if (error) throw error;
      return {
        consultants: (rows ?? []) as ConsultantRow[],
        total: count ?? 0,
      };
    },
  });

  const consultants = data?.consultants ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + consultants.length, total);

  useEffect(() => {
    if (!isLoading && page > totalPages) {
      navigate({ search: { page: totalPages, q }, replace: true });
    }
  }, [isLoading, page, totalPages, q, navigate]);

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const windowSize = 5;
    let start = Math.max(1, safePage - Math.floor(windowSize / 2));
    const end = Math.min(totalPages, start + windowSize - 1);
    start = Math.max(1, end - windowSize + 1);
    for (let i = start; i <= end; i += 1) pages.push(i);
    return pages;
  }, [safePage, totalPages]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["consultants"] });

  const saveMutation = useMutation({
    mutationFn: async ({ mode, id }: { mode: "create" | "edit"; id?: string }) => {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        regional: form.regional.trim() || null,
        active: form.active,
      };
      if (!payload.name) throw new Error("Nome obrigatório");

      if (mode === "create") {
        const { error } = await api.from("consultants").insert(payload);
        if (error) throw error;
        return;
      }
      const { error } = await api.from("consultants").update(payload).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: (_, { mode }) => {
      toast.success(mode === "create" ? "Consultor adicionado" : "Consultor atualizado");
      setForm(emptyForm);
      setCreateOpen(false);
      setEditOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await api.from("consultants").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_, ids) => {
      toast.success(ids.length === 1 ? "Consultor excluído" : `${ids.length} consultores excluídos`);
      setDeleteTarget(null);
      setSelected(new Set());
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const goToSearch = (nextQ: string, nextPage = 1) => {
    navigate({
      search: { page: nextPage, q: nextQ.trim() },
    });
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAllOnPage = (checked: boolean) => {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(consultants.map((c) => c.id)));
  };

  const openEdit = (consultant: ConsultantRow) => {
    setEditing(consultant);
    setForm({
      name: consultant.name,
      email: consultant.email ?? "",
      phone: consultant.phone ?? "",
      regional: consultant.regional ?? "",
      active: consultant.active,
    });
    setEditOpen(true);
  };

  const formFields = (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Nome</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Telefone (WhatsApp)</Label>
        <Input
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="+5511999999999"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Regional</Label>
        <Input value={form.regional} onChange={(e) => setForm({ ...form, regional: e.target.value })} />
      </div>
      <div className="flex items-center justify-between rounded-lg border px-3 py-2">
        <Label htmlFor="consultant-active">Ativo</Label>
        <Switch
          id="consultant-active"
          checked={form.active}
          onCheckedChange={(active) => setForm({ ...form, active })}
        />
      </div>
    </div>
  );

  const allOnPageSelected = consultants.length > 0 && consultants.every((c) => selected.has(c.id));

  return (
    <div>
      <PageHeader
        title="Consultores"
        description={
          total > 0
            ? `${total} consultor${total === 1 ? "" : "es"} cadastrado${total === 1 ? "" : "s"}`
            : "Nenhum consultor encontrado"
        }
        actions={
          canManageConsultants ? (
            <div className="flex flex-wrap items-center gap-2">
              {selected.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() =>
                    setDeleteTarget({
                      ids: Array.from(selected),
                      label: `${selected.size} consultor${selected.size === 1 ? "" : "es"} selecionado${selected.size === 1 ? "" : "s"}`,
                    })
                  }
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Excluir selecionados ({selected.size})
                </Button>
              )}
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => setForm(emptyForm)}>
                    <Plus className="h-4 w-4 mr-1" /> Novo
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Novo consultor</DialogTitle>
                  </DialogHeader>
                  {formFields}
                  <DialogFooter>
                    <Button
                      onClick={() => saveMutation.mutate({ mode: "create" })}
                      disabled={saveMutation.isPending}
                    >
                      Salvar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          ) : undefined
        }
      />

      <div className="p-6 lg:p-10 space-y-4">
        <form
          className="flex flex-col sm:flex-row gap-2 max-w-xl"
          onSubmit={(event) => {
            event.preventDefault();
            goToSearch(searchInput, 1);
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por nome ou email…"
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
          {q && (
            <Button type="button" variant="ghost" onClick={() => goToSearch("")}>
              Limpar
            </Button>
          )}
        </form>

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                {canManageConsultants && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allOnPageSelected}
                      onCheckedChange={(checked) => toggleAllOnPage(checked === true)}
                      aria-label="Selecionar todos da página"
                    />
                  </TableHead>
                )}
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Regional</TableHead>
                <TableHead>Status</TableHead>
                {canManageConsultants && <TableHead className="w-28 text-right">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={canManageConsultants ? 7 : 5} className="py-16 text-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                    Carregando consultores…
                  </TableCell>
                </TableRow>
              ) : consultants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canManageConsultants ? 7 : 5} className="text-center py-10 text-muted-foreground">
                    {q ? "Nenhum consultor encontrado para esta busca." : "Nenhum consultor cadastrado."}
                  </TableCell>
                </TableRow>
              ) : (
                consultants.map((c) => (
                  <TableRow key={c.id} data-state={selected.has(c.id) ? "selected" : undefined}>
                    {canManageConsultants && (
                      <TableCell>
                        <Checkbox
                          checked={selected.has(c.id)}
                          onCheckedChange={(checked) => toggleOne(c.id, checked === true)}
                          aria-label={`Selecionar ${c.name}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-sm">{c.email || "—"}</TableCell>
                    <TableCell className="text-sm">{c.phone || "—"}</TableCell>
                    <TableCell className="text-sm">{c.regional || "—"}</TableCell>
                    <TableCell className="text-sm">{c.active ? "Ativo" : "Inativo"}</TableCell>
                    {canManageConsultants && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(c)} aria-label="Editar">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setDeleteTarget({ ids: [c.id], label: `o consultor "${c.name}"` })
                            }
                            aria-label="Excluir"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            {total > 0
              ? `Exibindo ${rangeStart}–${rangeEnd} de ${total}`
              : "Nenhum resultado"}
            {isFetching && !isLoading ? " · atualizando…" : ""}
          </span>

          {totalPages > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    className={safePage <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    onClick={(event) => {
                      event.preventDefault();
                      if (safePage > 1) navigate({ search: { page: safePage - 1, q } });
                    }}
                  >
                    Anterior
                  </PaginationPrevious>
                </PaginationItem>
                {pageNumbers.map((pageNumber) => (
                  <PaginationItem key={pageNumber}>
                    <PaginationLink
                      href="#"
                      isActive={pageNumber === safePage}
                      className="cursor-pointer"
                      onClick={(event) => {
                        event.preventDefault();
                        navigate({ search: { page: pageNumber, q } });
                      }}
                    >
                      {pageNumber}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    className={safePage >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    onClick={(event) => {
                      event.preventDefault();
                      if (safePage < totalPages) navigate({ search: { page: safePage + 1, q } });
                    }}
                  >
                    Próxima
                  </PaginationNext>
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar consultor</DialogTitle>
          </DialogHeader>
          {formFields}
          <DialogFooter>
            <Button
              onClick={() => editing && saveMutation.mutate({ mode: "edit", id: editing.id })}
              disabled={saveMutation.isPending || !editing}
            >
              Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir consultor{deleteTarget && deleteTarget.ids.length > 1 ? "es" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Você está prestes a excluir{" "}
              {deleteTarget?.label ?? "os consultores selecionados"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.ids)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
