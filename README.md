# xuehaonan27's blog

Personal blog of Xue Haonan, built with [Astro](https://astro.build/) and the
[AstroPaper](https://github.com/satnaing/astro-paper) theme, deployed to
GitHub Pages at [xuehaonan27.github.io](https://xuehaonan27.github.io/).

## Commands

All commands are run from the root of the project, from a terminal:

| Command        | Action                                       |
| :------------- | :------------------------------------------- |
| `pnpm install` | Installs dependencies                        |
| `pnpm dev`     | Starts local dev server at `localhost:4321`  |
| `pnpm build`   | Build your production site to `./dist/`      |
| `pnpm preview` | Preview your build locally, before deploying |

Blog posts live in [`src/content/posts/`](./src/content/posts/) as Markdown
files with frontmatter (`title`, `pubDatetime`, `description`, `tags`).

Deployment is handled automatically by the
[Deploy to GitHub Pages](./.github/workflows/deploy.yml) workflow on every
push to the `gh-pages` branch.
