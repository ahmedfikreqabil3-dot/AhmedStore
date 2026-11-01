import type { ComponentProps, ReactNode } from 'react';
import { Icon } from './Icon.js';

export function OperationHeader({ id, title, description, icon, level = 'h2' }: { id: string; title: ReactNode; description: string; icon: ComponentProps<typeof Icon>['name']; level?: 'h2' | 'h3' }) {
  const Heading = level;
  return <header className="operation-heading"><span className="section-icon"><Icon name={icon}/></span><div><Heading id={id}>{title}</Heading><p>{description}</p></div></header>;
}
