# Supplementary Logos

Logos of technologies and services that [simple-icons](https://simpleicons.org) does not have, in its format: one
path in a box of 24 × 24, filled with the color of the brand. The plugin `../techIcons.ts` merges them into the catalog
of logos of the application, before the logos of simple-icons.

- `logos.json` — the logos: `slug`, `title`, `hex`, `aliases.aka` (other names, Russian ones too), `source` (where the
  logo comes from and under which license) and `path`. A slug that simple-icons has too stops the build: when an update
  of simple-icons brings a logo back, remove it here.
- `names.json` — other names of logos of simple-icons, by slug: Russian names («Яндекс Облако», «ВКонтакте»), and the
  logo of Linux for Russian distributions of it («Astra Linux», «РЕД ОС»). A slug that neither set has stops the build.

Product names and logos are trademarks of their owners; their use here identifies the technologies on diagrams and
does not imply endorsement.

## Sources

- **simple-icons 9.x–15.x** (CC0-1.0): logos that simple-icons removed at the request of their owners — AWS and its
  services, Microsoft and its products, Azure, Oracle, OpenAI, Slack, Salesforce and others — as its last release
  with each of them had it.
- **@alfalab/icons-logo**, **@alfalab/icons-logotype** (MIT, [core-ds/icons](https://github.com/core-ds/icons)).
- **@megafon/ui-icons** (MIT, Copyright (c) 2020 PJSC MegaFon).
- **@vkontakte/icons** (MIT, Copyright (c) 2017-present, VK LLC).
- **@salutejs/plasma-icons** (MIT, Copyright (c) Salute Devices).
- **@cloud-ru/uikit-product-icons** (Apache-2.0, [cloud-ru-tech/uikit-product](https://github.com/cloud-ru-tech/uikit-product)).
- **@tarantool.io/ui-kit** (ISC, [tarantool/front-ui-kit](https://github.com/tarantool/front-ui-kit)).
- **Devicon** (MIT, Copyright (c) 2015 konpa, [devicons/devicon](https://github.com/devicons/devicon)).
- **SVG Logos** (CC0-1.0, [gilbarbara/logos](https://github.com/gilbarbara/logos)).
- The logos in the repositories of YDB, Greenplum, Deckhouse, werf, userver and Picodata on GitHub, named in `source`.

The MIT license of the packages above:

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
> documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
> rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
> persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
> Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
> WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
> COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
> OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The logos of `@cloud-ru/uikit-product-icons`, YDB, Greenplum, werf and userver come from works licensed under the
[Apache License, Version 2.0](https://www.apache.org/licenses/LICENSE-2.0); they were changed as described below.

## How a logo is made

A logo that is one path of one color already is taken as it is. A logo of several colors becomes its silhouette: the
shapes in the colors of the mark are united, and the white shapes and those of the background are cut out of them, in
the order they are painted; the words beside the mark are cut off. The result is scaled to fill the box of 24 × 24 by
its larger side and centred. The color is the main color of the mark in the same source.

Compare a new logo with its original on the badge of a shape and on the picture of 96 × 96 that the search adds,
before adding it.
