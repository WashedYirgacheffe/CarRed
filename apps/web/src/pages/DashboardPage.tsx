import ToolCard from '../components/ToolCard';

export default function DashboardPage() {
  return (
    <div className="page">
      <h1>CarRed</h1>
      <p className="sub">RedBox online migration - cloud workspace edition.</p>
      <div className="tools-grid">
        <ToolCard to="/chat" title="Chat" desc="Agent chat with queued worker execution." />
        <ToolCard to="/knowledge" title="Knowledge" desc="Knowledge ingestion and retrieval entrance." />
        <ToolCard to="/media" title="Media" desc="Media processing and library management." />
        <ToolCard to="/manuscripts" title="Manuscripts" desc="Draft, refine and publish content flows." />
        <ToolCard to="/redclaw" title="RedClaw" desc="Automation and long-cycle execution center." />
      </div>
    </div>
  );
}
