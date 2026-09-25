const common = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function ProductsIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M6 8h12l-1 12H7L6 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

export function OrdersIcon(props) {
  return (
    <svg {...common} {...props}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <rect x="9" y="2" width="6" height="4" rx="1" />
      <line x1="8" y1="11" x2="16" y2="11" />
      <line x1="8" y1="15" x2="16" y2="15" />
      <line x1="8" y1="19" x2="13" y2="19" />
    </svg>
  );
}

export function KitchenIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M2 11h3M19 11h3" />
      <path d="M4 11h16" />
      <path d="M5 11v3a7 7 0 0 0 14 0v-3" />
      <path d="M9 7c0-1 .5-1.5.5-2.5M12 7c0-1 .5-1.5.5-2.5M15 7c0-1 .5-1.5.5-2.5" />
    </svg>
  );
}

export function ReportsIcon(props) {
  return (
    <svg {...common} {...props}>
      <line x1="4" y1="20" x2="20" y2="20" />
      <rect x="6" y="13" width="3" height="7" />
      <rect x="11" y="9" width="3" height="11" />
      <rect x="16" y="5" width="3" height="15" />
    </svg>
  );
}

export function SunIcon(props) {
  return (
    <svg {...common} {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

export function MoonIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 1 0 10.5 10.5z" />
    </svg>
  );
}

export function PlusIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function MinusIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M5 12h14" />
    </svg>
  );
}

export function PencilIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M4 20h4L19 9l-4-4L4 16v4z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

export function TrashIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 13h10l1-13M9 7V4h6v3" />
    </svg>
  );
}

export function CheckIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

export function CloseIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function ClockIcon(props) {
  return (
    <svg {...common} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function AlertIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M12 3l10 18H2L12 3z" />
      <path d="M12 10v5M12 18h.01" />
    </svg>
  );
}

export function LogoutIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 8l-4 4 4 4M6 12h10" />
    </svg>
  );
}

export function SendIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M4 12l16-8-6 16-3-7-7-1z" />
    </svg>
  );
}

export function MoneyIcon(props) {
  return (
    <svg {...common} {...props}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9.5v5M18 9.5v5" />
    </svg>
  );
}

export function TrophyIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4z" />
      <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" />
      <path d="M12 13v4M9 20h6M10 17h4" />
    </svg>
  );
}

export function TrendIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  );
}

export function BoxIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5v-9z" />
      <path d="M3 7.5L12 12l9-4.5M12 12v9" />
    </svg>
  );
}

export function DownloadIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M12 4v11M7 10l5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}
