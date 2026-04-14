import { supabase } from './supabase';

export type Urgency = 'rot' | 'gelb' | 'grün';

export type Task = {
  id: string;
  name: string;
  room: string;
  frequency: string;
  effort_minutes: number;
  priority: string;
  is_one_time: boolean;
  is_active: boolean;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
};

export type TaskWithStatus = Task & {
  last_completed_at: string | null;
  urgency: Urgency;
};

export type OneTimeTask = Task & {
  completed_at: string | null;
};

const FREQUENCY_DAYS: Record<string, number> = {
  'täglich': 1,
  '2x wöchentlich': 3.5,
  'wöchentlich': 7,
  'alle 2 wochen': 14,
  'monatlich': 30,
};

function calcUrgency(last_completed_at: string | null, frequency: string): Urgency {
  let freqDays: number;
  if (frequency.includes(',')) {
    // Custom day-of-week selection, e.g. "mo,mi,fr" → 7 / 3 ≈ 2.33 days between completions
    const dayCount = frequency.split(',').filter(Boolean).length;
    freqDays = dayCount > 0 ? 7 / dayCount : 7;
  } else {
    freqDays = FREQUENCY_DAYS[frequency.toLowerCase()] ?? 7;
  }
  const freqMs = freqDays * 24 * 60 * 60 * 1000;

  const now = Date.now();
  const lastMs = last_completed_at ? new Date(last_completed_at).getTime() : 0;
  const ageMs = now - lastMs;

  if (ageMs > freqMs * 2) return 'rot';
  if (ageMs > freqMs) return 'gelb';
  return 'grün';
}

export async function getTasks(): Promise<Task[]> {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('is_one_time', false)
    .eq('is_active', true)
    .or(`scheduled_end.is.null,scheduled_end.gte.${today}`);

  if (error) throw error;
  return data ?? [];
}

export async function getTasksWithStatus(): Promise<TaskWithStatus[]> {
  const today = new Date().toISOString().split('T')[0];
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('*')
    .eq('is_one_time', false)
    .eq('is_active', true)
    .or(`scheduled_end.is.null,scheduled_end.gte.${today}`);

  if (tasksError) throw tasksError;
  if (!tasks || tasks.length === 0) return [];

  const taskIds = tasks.map((t: Task) => t.id);

  const { data: completions, error: completionsError } = await supabase
    .from('task_completions')
    .select('task_id, completed_at')
    .in('task_id', taskIds)
    .order('completed_at', { ascending: false });

  if (completionsError) throw completionsError;

  const lastCompletionMap: Record<string, string> = {};
  for (const c of completions ?? []) {
    if (!lastCompletionMap[c.task_id]) {
      lastCompletionMap[c.task_id] = c.completed_at;
    }
  }

  return tasks.map((task: Task) => {
    const last_completed_at = lastCompletionMap[task.id] ?? null;
    return {
      ...task,
      last_completed_at,
      urgency: calcUrgency(last_completed_at, task.frequency),
    };
  });
}

export async function getSuggestedTasks(durationMinutes: number): Promise<TaskWithStatus[]> {
  const all = await getTasksWithStatus();

  const urgencyOrder: Urgency[] = ['rot', 'gelb', 'grün'];
  const priorityOrder = ['hoch', 'mittel', 'niedrig'];

  const sorted = [...all].sort((a, b) => {
    const urgencyDiff = urgencyOrder.indexOf(a.urgency) - urgencyOrder.indexOf(b.urgency);
    if (urgencyDiff !== 0) return urgencyDiff;
    return priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority);
  });

  const selected: TaskWithStatus[] = [];
  let totalMinutes = 0;
  const usedRooms = new Set<string>();

  for (const task of sorted) {
    if (selected.length >= 4) break;
    if (totalMinutes + task.effort_minutes > durationMinutes) continue;

    const roomPenalty = usedRooms.has(task.room) ? 1 : 0;
    if (roomPenalty && selected.length >= 2) continue;

    selected.push(task);
    totalMinutes += task.effort_minutes;
    usedRooms.add(task.room);
  }

  if (selected.length < 2) {
    for (const task of sorted) {
      if (selected.find(t => t.id === task.id)) continue;
      if (selected.length >= 4) break;
      if (totalMinutes + task.effort_minutes > durationMinutes) continue;
      selected.push(task);
      totalMinutes += task.effort_minutes;
    }
  }

  return selected;
}

export async function completeTask(taskId: string): Promise<void> {
  const { error } = await supabase
    .from('task_completions')
    .insert({ task_id: taskId, completed_at: new Date().toISOString() });

  if (error) throw error;
}

export async function uncompleteTask(taskId: string): Promise<void> {
  // Supabase REST doesn't support DELETE with ORDER BY LIMIT, so we do it in two steps:
  // 1. find the most recent completion id, 2. delete it by id.
  const { data, error: fetchError } = await supabase
    .from('task_completions')
    .select('id')
    .eq('task_id', taskId)
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!data) return; // nothing to delete

  const { error: deleteError } = await supabase
    .from('task_completions')
    .delete()
    .eq('id', data.id);

  if (deleteError) throw deleteError;
}

export async function createSession(durationMinutes: number, taskIds: string[]): Promise<string> {
  const { data, error } = await supabase
    .from('sessions')
    .insert({ duration_minutes: durationMinutes, task_ids: taskIds, started_at: new Date().toISOString() })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

export async function completeSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) throw error;
}

export async function getSessionsThisWeek() {
  const now = new Date();
  const daysFromMonday = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysFromMonday);
  monday.setHours(0, 0, 0, 0);
  // Shift to local midnight so Supabase (UTC) gets the right cutoff
  monday.setTime(monday.getTime() - monday.getTimezoneOffset() * 60000);

  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .gte('started_at', monday.toISOString());

  if (error) throw error;
  return data ?? [];
}

/**
 * Returns a 7-element boolean array (index 0 = Monday … 6 = Sunday) for the
 * current week. A day is true if:
 *   - at least one session was completed (completed_at IS NOT NULL) that day, OR
 *   - at least 3 task_completions rows have completed_at on that day.
 */
function toLocalDayIndex(isoString: string): number {
  const d = new Date(isoString);
  // Reconstruct from local year/month/day to avoid UTC day-shift
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return (local.getDay() + 6) % 7;
}

export async function getActivityByDay(): Promise<boolean[]> {
  const now = new Date();
  const todayIdx = toLocalDayIndex(now.toISOString()); // 0=Mon … 6=Sun

  const monday = new Date(now);
  monday.setDate(now.getDate() - todayIdx);
  monday.setHours(0, 0, 0, 0);
  // Shift to local midnight so Supabase (UTC) gets the right cutoff
  monday.setTime(monday.getTime() - monday.getTimezoneOffset() * 60000);
  const mondayIso = monday.toISOString();

  const [sessionsRes, completionsRes] = await Promise.all([
    supabase
      .from('sessions')
      .select('completed_at')
      .gte('started_at', mondayIso),
    supabase
      .from('task_completions')
      .select('completed_at')
      .gte('completed_at', mondayIso),
  ]);

  if (sessionsRes.error)     throw sessionsRes.error;
  if (completionsRes.error)  throw completionsRes.error;

  const activity: boolean[] = Array(7).fill(false);

  // A completed session marks that day active
  for (const s of sessionsRes.data ?? []) {
    if (!s.completed_at) continue;
    activity[toLocalDayIndex(s.completed_at)] = true;
  }

  // ≥3 task completions on a day also marks it active
  const counts: Record<number, number> = {};
  for (const c of completionsRes.data ?? []) {
    const idx = toLocalDayIndex(c.completed_at);
    counts[idx] = (counts[idx] ?? 0) + 1;
  }
  for (const [idx, count] of Object.entries(counts)) {
    if (count >= 3) activity[Number(idx)] = true;
  }

  return activity;
}

export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update({ is_active: false })
    .eq('id', taskId);
  if (error) throw error;
}

export async function addTask(task: Omit<Task, 'id'>): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .insert(task)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTask(taskId: string, updates: Omit<Partial<Task>, 'id'>): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', taskId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getArchivedTasks(): Promise<Task[]> {
  const today = new Date().toISOString().split('T')[0];
  // Two separate queries because Supabase .or() can't combine a boolean
  // equality with a nullable date comparison cleanly in one call.
  const [inactiveRes, expiredRes] = await Promise.all([
    supabase.from('tasks').select('*').eq('is_active', false),
    supabase
      .from('tasks')
      .select('*')
      .eq('is_active', true)
      .not('scheduled_end', 'is', null)
      .lt('scheduled_end', today),
  ]);
  if (inactiveRes.error)  throw inactiveRes.error;
  if (expiredRes.error)   throw expiredRes.error;

  // Deduplicate (a task could theoretically match both)
  const seen = new Set<string>();
  return [...(inactiveRes.data ?? []), ...(expiredRes.data ?? [])].filter(t => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

export type Room = {
  id: string;
  key: string;
  name: string;
  color: string;
  sort_order: number;
  is_active: boolean;
};

export async function getRooms(): Promise<Room[]> {
  const { data, error } = await supabase
    .from('rooms')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function addRoom(data: { key: string; name: string; color: string; sort_order: number }): Promise<Room> {
  const { data: room, error } = await supabase
    .from('rooms')
    .insert({ ...data, is_active: true })
    .select()
    .single();
  if (error) throw error;
  return room;
}

export async function updateRoom(id: string, updates: Partial<Room>): Promise<void> {
  const { error } = await supabase
    .from('rooms')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
}

export async function resetAllData(): Promise<void> {
  const [c1, c2] = await Promise.all([
    supabase.from('task_completions').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
    supabase.from('sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
  ]);
  if (c1.error) throw c1.error;
  if (c2.error) throw c2.error;
}

export async function getOneTimeTasks(): Promise<OneTimeTask[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, task_completions(completed_at)')
    .eq('is_one_time', true)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((task: Task & { task_completions: { completed_at: string }[] }) => ({
    ...task,
    completed_at: task.task_completions?.[0]?.completed_at ?? null,
    task_completions: undefined,
  }));
}
