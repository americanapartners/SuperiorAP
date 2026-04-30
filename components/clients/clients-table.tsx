"use client";

import { useState, useEffect } from "react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Pencil, Trash2, GripVertical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Client } from "@/lib/types";

function SortableRow({
  client, isAdmin, onEdit, onDelete,
}: {
  client: Client; isAdmin: boolean;
  onEdit: (c: Client) => void; onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: client.id, disabled: !isAdmin });

  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
    >
      <TableCell>
        {isAdmin && (
          <span {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </span>
        )}
      </TableCell>
      <TableCell className="font-medium">{client.display_order}</TableCell>
      <TableCell>{client.name}</TableCell>
      <TableCell className="text-right">
        {isAdmin && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => onEdit(client)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(client.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

export function ClientsTable({ isAdmin = false }: { isAdmin?: boolean }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [formName, setFormName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => { fetchClients(); }, []);

  const fetchClients = async () => {
    try {
      const res = await fetch("/api/clients");
      if (!res.ok) throw new Error();
      setClients(await res.json());
    } catch { toast.error("Failed to load clients"); }
    finally { setIsLoading(false); }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = clients.findIndex((c) => c.id === active.id);
    const newIndex = clients.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(clients, oldIndex, newIndex).map((c, i) => ({ ...c, display_order: i + 1 }));
    setClients(reordered);
    try {
      const res = await fetch("/api/clients/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: reordered.map((c) => c.id) }),
      });
      if (!res.ok) throw new Error();
      toast.success("Client order saved");
    } catch {
      toast.error("Failed to save order");
      fetchClients();
    }
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setIsSaving(true);
    try {
      const url = editingClient ? `/api/clients/${editingClient.id}` : "/api/clients";
      const method = editingClient ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName.trim() }),
      });
      if (!res.ok) throw new Error();
      toast.success(editingClient ? "Client updated" : "Client added");
      setIsDialogOpen(false);
      setEditingClient(null);
      setFormName("");
      fetchClients();
    } catch { toast.error("Failed to save client"); }
    finally { setIsSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this client? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/clients/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Client deleted");
      fetchClients();
    } catch { toast.error("Failed to delete client"); }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Client List</CardTitle>
            <CardDescription>
              {isAdmin ? "Drag to reorder. Changes are applied globally." : "Clients and report display order."}
            </CardDescription>
          </div>
          {isAdmin && (
            <Button onClick={() => { setEditingClient(null); setFormName(""); setIsDialogOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Add Client
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead className="w-16">Order</TableHead>
                <TableHead>Client Name</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SortableContext items={clients.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                {clients.map((client) => (
                  <SortableRow
                    key={client.id}
                    client={client}
                    isAdmin={isAdmin}
                    onEdit={(c) => { setEditingClient(c); setFormName(c.name); setIsDialogOpen(true); }}
                    onDelete={handleDelete}
                  />
                ))}
              </SortableContext>
            </TableBody>
          </Table>
        </DndContext>
      </CardContent>

      {isAdmin && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>{editingClient ? "Edit Client" : "Add Client"}</DialogTitle>
                <DialogDescription>
                  {editingClient ? "Update client name." : "New client added at the bottom of the list."}
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Label htmlFor="name">Client Name</Label>
                <Input
                  id="name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Enter client name"
                  required
                  className="mt-2"
                />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isSaving}>
                  {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {editingClient ? "Update" : "Add"} Client
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
