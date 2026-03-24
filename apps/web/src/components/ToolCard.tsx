import { Link } from 'react-router-dom';

type ToolCardProps = {
  to: string;
  title: string;
  desc: string;
  badge?: string;
};

export default function ToolCard({ to, title, desc, badge = 'LIVE' }: ToolCardProps) {
  return (
    <Link to={to} className="tool-card">
      <div className="tool-top">
        <h3>{title}</h3>
        <span>{badge}</span>
      </div>
      <p>{desc}</p>
    </Link>
  );
}
