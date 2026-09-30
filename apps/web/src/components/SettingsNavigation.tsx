import { NavLink } from 'react-router';

export function SettingsNavigation() {
  return (
    <nav aria-label="设置导航" className="mb-4 flex flex-wrap gap-1 border-b pb-3">
      {[
        { path: '/settings', label: '通用设置', end: true },
        { path: '/settings/providers', label: '模型与服务商', end: false },
      ].map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.end}
          className={({ isActive }) =>
            `rounded-md px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring ${isActive ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'}`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
