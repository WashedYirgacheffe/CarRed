import type { ReactNode } from 'react';

type Props = {
  title: string;
  endpoint: string;
  note: ReactNode;
};

export default function PlaceholderPage({ title, endpoint, note }: Props) {
  return (
    <div className="page narrow">
      <h1>{title}</h1>
      <p className="sub">{endpoint}</p>
      <div className="panel">{note}</div>
    </div>
  );
}
