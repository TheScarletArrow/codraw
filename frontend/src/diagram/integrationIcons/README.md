# Integration Icons

Icons of the ways systems talk to each other, for the «Интеграции» section of the palette: a glyph of
[Lucide](https://lucide.dev) 1.53.0 (`lucide-react`, ISC, see `LICENSE`), white, on a rounded square of the color
of its group. The tile is 128 × 128 with corners of 24; the glyph, drawn on Lucide's grid of 24 × 24 with a stroke of 2,
is scaled three times and centred.

| File | Glyph | Group, color |
| --- | --- | --- |
| `rest-api.svg` | `braces` | APIs, `#2563EB` |
| `soap.svg` | `code-xml` | APIs, `#2563EB` |
| `websocket.svg` | `arrow-right-left` | APIs, `#2563EB` |
| `webhook.svg` | `webhook` | APIs, `#2563EB` |
| `message-queue.svg` | `mails` | Messaging, `#EA580C` |
| `pubsub.svg` | `radio-tower` | Messaging, `#EA580C` |
| `esb.svg` | a bus with three stations, drawn for CoDraw on Lucide's grid | Messaging, `#EA580C` |
| `email.svg` | `mail` | Notifications, `#16A34A` |
| `sms.svg` | `message-square-text` | Notifications, `#16A34A` |
| `push.svg` | `bell-ring` | Notifications, `#16A34A` |
| `file-transfer.svg` | `folder-sync` | Files and data, `#7C3AED` |
| `etl.svg` | `database-arrow-down` | Files and data, `#7C3AED` |

These assets are embedded in shape styles so diagrams and exported files do not depend on a CDN or an application
asset URL. A cell is told to be one of these icons by its image, so a file once released must not change: a new look is
a new file.
