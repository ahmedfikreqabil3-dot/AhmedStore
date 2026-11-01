import type { ReactNode } from 'react';
type IconName = 'store' | 'dashboard' | 'pos' | 'box' | 'sales' | 'purchase' | 'inventory' | 'wallet' | 'settings' | 'search' | 'plus' | 'chevron' | 'check' | 'close' | 'trash' | 'barcode' | 'arrow' | 'receipt' | 'download' | 'clock' | 'user' | 'filter' | 'card';
const paths: Record<IconName, ReactNode> = {
  store: <><path d="M3 10v11h18V10M2 4h20l-2 6H4L2 4Z"/><path d="M9 21v-7h6v7M2 10c1 3 4 3 5 0 1 3 4 3 5 0 1 3 4 3 5 0 1 3 4 3 5 0"/></>,
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="11" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="18" width="7" height="3" rx="1"/></>,
  pos: <><rect x="3" y="3" width="18" height="12" rx="2"/><path d="M8 21h8m-4-6v6M7 8h4m-4 3h7m3-4v4"/></>,
  box: <><path d="m12 2 10 5-10 5L2 7l10-5Zm0 10v10M2 7v10l10 5 10-5V7M7 4.5l10 5"/></>,
  sales: <><path d="M6 3h12v19l-3-2-3 2-3-2-3 2V3ZM9 7h6m-6 4h6m-6 4h3"/></>,
  purchase: <><path d="M3 3h2l3 13h11l3-10H6M10 10h8m-4-3v6"/><circle cx="10" cy="20" r="1"/><circle cx="18" cy="20" r="1"/></>,
  inventory: <><path d="m3 8 9-5 9 5v13H3V8Zm4 13V11h10v10M7 15h10M7 18h10"/></>,
  wallet: <><rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 8V5l14-3v3m-1 7h5v5h-5a2 2 0 0 1 0-5Z"/></>,
  settings: <><path d="m9 3-1 3-3 1-2 4 2 2v4l4 3 3-1 3 1 4-3v-4l2-2-2-4-3-1-1-3H9Z"/><circle cx="12" cy="12" r="3"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  plus: <path d="M12 5v14M5 12h14"/>, chevron: <path d="m9 5 7 7-7 7"/>,
  check: <path d="m5 12 4 4L19 6"/>, close: <path d="m6 6 12 12M6 18 18 6"/>,
  trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></>,
  barcode: <><path d="M3 7V3h4m10 0h4v4M3 17v4h4m10 0h4v-4M6 8v8m3-8v8m3-8v8m4-8v8m3-8v8"/></>,
  arrow: <path d="m14 6-6 6 6 6M8 12h13"/>, receipt: <><path d="M5 3h14v19l-3-2-4 2-4-2-3 2V3ZM8 7h8m-8 4h8m-8 4h5"/></>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  user: <><circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/></>,
  filter: <><path d="M4 6h16M7 12h10m-7 6h4"/><circle cx="8" cy="6" r="2"/><circle cx="15" cy="12" r="2"/></>,
  card: <><rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 9h20M6 15h4"/></>
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>; }
