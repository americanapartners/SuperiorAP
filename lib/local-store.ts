import { promises as fs } from "fs";
import path from "path";
import { DEFAULT_CLIENTS } from "./constants/clients";
import type { Client } from "./types";

const DATA_FILE = path.join(process.cwd(), "data", "clients.json");

async function ensureDataFile(): Promise<Client[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw) as Client[];
  } catch {
    const seeded: Client[] = DEFAULT_CLIENTS.map((name, i) => ({
      id: crypto.randomUUID(),
      name,
      display_order: i + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(seeded, null, 2));
    return seeded;
  }
}

async function writeClients(clients: Client[]): Promise<void> {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(clients, null, 2));
}

export const localStore = {
  async getClients(): Promise<Client[]> {
    const clients = await ensureDataFile();
    return clients.sort((a, b) => a.display_order - b.display_order);
  },

  async createClient(name: string, display_order: number): Promise<Client> {
    const clients = await ensureDataFile();
    const newClient: Client = {
      id: crypto.randomUUID(),
      name,
      display_order,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    clients.push(newClient);
    await writeClients(clients);
    return newClient;
  },

  async updateClient(id: string, name: string, display_order: number): Promise<Client | null> {
    const clients = await ensureDataFile();
    const idx = clients.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    clients[idx] = {
      ...clients[idx],
      name,
      display_order,
      updated_at: new Date().toISOString(),
    };
    await writeClients(clients);
    return clients[idx];
  },

  async deleteClient(id: string): Promise<boolean> {
    const clients = await ensureDataFile();
    const filtered = clients.filter((c) => c.id !== id);
    if (filtered.length === clients.length) return false;
    await writeClients(filtered);
    return true;
  },
};

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return !!url && url !== "your-supabase-url" && url.startsWith("https://");
}
