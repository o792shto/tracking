import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { advanceWeek, createWorld, type World } from '../sim';
import { removeKey } from './storage';

/** 名簿の世界の保存先（ゲームの進み具合とは別。大きいので圧縮して保存する） */
export const WORLD_KEY = 'keiba-tracking/world-v1';

export type WorldStatus = 'loading' | 'creating' | 'advancing' | 'ready';

export interface WorldState {
  world: World | null;
  status: WorldStatus;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** 名簿を文字列にする（gzip が使えれば圧縮して "gz:" を付ける） */
export async function encodeWorld(world: World): Promise<string> {
  const json = JSON.stringify(world);
  if (typeof CompressionStream === 'undefined') return json;
  try {
    return 'gz:' + bytesToBase64(await pipe(new TextEncoder().encode(json), new CompressionStream('gzip')));
  } catch {
    return json;
  }
}

export async function decodeWorld(raw: string): Promise<World | null> {
  try {
    const json = raw.startsWith('gz:')
      ? new TextDecoder().decode(await pipe(base64ToBytes(raw.slice(3)), new DecompressionStream('gzip')))
      : raw;
    const world = JSON.parse(json) as World;
    return world && world.version === 1 && Array.isArray(world.horses) ? world : null;
  } catch {
    return null;
  }
}

let saving: Promise<void> = Promise.resolve();

/** 保存は圧縮が終わってから順番に行う（画面の更新は待たせない） */
function saveWorld(world: World): Promise<void> {
  saving = saving.then(async () => {
    const text = await encodeWorld(world);
    try {
      window.localStorage.setItem(WORLD_KEY, text);
    } catch {
      // 保存できなくてもゲームは続ける（次に開いたときは世界が作り直しになる）
    }
  });
  return saving;
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(WORLD_KEY);
  } catch {
    return null;
  }
}

/** 重い計算の前に、読み込み中の表示を一度描かせる */
const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 30));

export function createWorldStore() {
  return createStore<WorldState>()(() => ({ world: null, status: 'loading' }));
}
export type WorldStore = ReturnType<typeof createWorldStore>;

/** 保存された世界を読み込む。なければ（または読めなければ）新しく作る */
export async function loadOrCreateWorld(store: WorldStore, seed: () => number): Promise<World> {
  const raw = readRaw();
  const saved = raw ? await decodeWorld(raw) : null;
  if (saved) {
    store.setState({ world: saved, status: 'ready' });
    return saved;
  }
  return newWorld(store, seed());
}

export async function newWorld(store: WorldStore, seed: number): Promise<World> {
  store.setState({ status: 'creating' });
  await nextFrame();
  const world = createWorld(seed);
  store.setState({ world, status: 'ready' });
  void saveWorld(world);
  return world;
}

/** 1週間を走らせて次の週へ進める（観戦レースの人気を成績に残す） */
export async function advanceWorld(store: WorldStore, popularity: Record<string, number[]>): Promise<World | null> {
  const current = store.getState().world;
  if (!current) return null;
  store.setState({ status: 'advancing' });
  await nextFrame();
  const world = advanceWeek(structuredClone(current), { popularity });
  store.setState({ world, status: 'ready' });
  void saveWorld(world);
  return world;
}

export function clearWorld() {
  removeKey(WORLD_KEY);
}

let appStore: WorldStore | null = null;
export function getWorldStore(): WorldStore {
  appStore ??= createWorldStore();
  return appStore;
}

export function useWorld<T>(selector: (s: WorldState) => T): T {
  return useStore(getWorldStore(), selector);
}
