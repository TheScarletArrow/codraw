import {
  AppWindow,
  Archive,
  Box,
  Boxes,
  BrickWall,
  Circle,
  Clock,
  Cloud,
  Component,
  Container,
  Cpu,
  Database,
  DoorOpen,
  FileText,
  Folder,
  Globe,
  HardDrive,
  Monitor,
  Network,
  Puzzle,
  Radio,
  Rows3,
  Search,
  Server,
  Ship,
  Signpost,
  Smartphone,
  Split,
  SquareDashed,
  SquareFunction,
  StickyNote,
  StickyNotes,
  Table2,
  Type,
  User,
  Warehouse,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { ShapeId } from './shapes.ts'

const ICONS: Partial<Record<ShapeId, LucideIcon>> = {
  text: Type,
  sticky: StickyNotes,
  'grid-table': Table2,
  list: Rows3,
  table: Table2,
  'flow-document': FileText,
  'bpmn-data-object': FileText,
  service: Server,
  database: Database,
  queue: Rows3,
  cache: Zap,
  user: User,
  'external-system': Cloud,
  document: FileText,
  boundary: SquareDashed,
  'load-balancer': Split,
  'api-gateway': DoorOpen,
  cdn: Network,
  server: HardDrive,
  container: Container,
  'kubernetes-cluster': Ship,
  firewall: BrickWall,
  dns: Signpost,
  'object-storage': Archive,
  'search-index': Search,
  'data-warehouse': Warehouse,
  'event-topic': Radio,
  scheduler: Clock,
  function: SquareFunction,
  browser: AppWindow,
  'mobile-app': Smartphone,
  'desktop-app': Monitor,
  'iot-device': Cpu,
  'uml-component': Puzzle,
  'uml-interface': Circle,
  'uml-package': Folder,
  'uml-note': StickyNote,
  'c4-person': User,
  'c4-system': Box,
  'c4-container': Boxes,
  'c4-component': Component,
  'c4-database': Database,
  'c4-external-system': Globe,
  'c4-boundary': SquareDashed,
}

/** Icon of a palette shape: a lucide icon, or the outline of a basic shape. */
export function ShapeIcon({ shape }: { shape: ShapeId }) {
  const Icon = ICONS[shape]
  if (Icon) return <Icon aria-hidden />
  return (
    <svg aria-hidden viewBox="0 0 20 18" className="size-5 fill-background stroke-foreground" strokeWidth={1.5}>
      {shape === 'rectangle' && <rect x="2" y="4" width="16" height="10" />}
      {shape === 'rounded' && <rect x="2" y="4" width="16" height="10" rx="3" />}
      {shape === 'ellipse' && <ellipse cx="10" cy="9" rx="8" ry="5.5" />}
      {shape === 'rhombus' && <path d="M10 2 18 9 10 16 2 9Z" />}
      {shape === 'triangle' && <path d="M10 2 18 16H2Z" />}
      {shape === 'hexagon' && <path d="M5 3H15L19 9L15 15H5L1 9Z" />}
      {shape === 'pentagon' && <path d="M10 2 18 8 15 16H5L2 8Z" />}
      {shape === 'star' && <path d="M10 1.5 12.3 6.4 17.6 7.1 13.7 10.8 14.7 16 10 13.4 5.3 16 6.3 10.8 2.4 7.1 7.7 6.4Z" />}
      {shape === 'flow-process' && <rect x="2" y="4" width="16" height="10" />}
      {shape === 'flow-terminator' && <rect x="2" y="4" width="16" height="10" rx="5" />}
      {shape === 'flow-decision' && <path d="M10 2 18 9 10 16 2 9Z" />}
      {shape === 'flow-data' && <path d="M6 4H18L14 14H2Z" />}
      {shape === 'flow-predefined-process' && (
        <>
          <rect x="2" y="4" width="16" height="10" />
          <path d="M6 4V14M14 4V14" />
        </>
      )}
      {shape === 'bpmn-task' && <rect x="2" y="4" width="16" height="10" rx="3" />}
      {shape === 'bpmn-event' && (
        <>
          <circle cx="10" cy="9" r="7" />
          <circle cx="10" cy="9" r="4.7" />
        </>
      )}
      {shape === 'bpmn-gateway' && (
        <>
          <path d="M10 2 18 9 10 16 2 9Z" />
          <path d="M7.2 6.2 12.8 11.8M12.8 6.2 7.2 11.8" />
        </>
      )}
      {shape === 'sequence' && (
        <>
          <rect x="1.5" y="1.5" width="6" height="4" />
          <rect x="12.5" y="1.5" width="6" height="4" />
          <path d="M4.5 5.5V16.5M15.5 5.5V16.5" strokeDasharray="1.5 1.5" />
          <path d="M4.5 10H15M12.5 8 15 10 12.5 12" fill="none" />
        </>
      )}
      {shape === 'bpmn-pool' && (
        <>
          <rect x="1.5" y="3" width="17" height="12" />
          <path d="M5.5 3V15M5.5 7H18.5M5.5 11H18.5" />
        </>
      )}
    </svg>
  )
}
