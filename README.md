# Galton Lab

A self-contained, browser-based Galton board for exploring randomness, binomial distributions, and the normal approximation. It uses Canvas for moving balls and charts, small ES modules for the probability/statistics engine, and local storage for the experiment notebook. There are no runtime dependencies or account requirements.

## Run locally

Requires Python 3 for the static development server and Node.js 18+ for the test suite.

```sh
npm run start
```

Open [http://localhost:4173](http://localhost:4173). The page is static and can also be hosted on any static web host.

## Tests

```sh
npm test
```

## Deploy to Vercel

Import the repository in Vercel and select **Other** as the framework. Leave the build command blank and set the output directory to `.`. Vercel serves `index.html`, `styles.css`, and the `src/` modules as static assets. Alternatively, use the Vercel CLI with `vercel` from the project root.

## Project structure

- `index.html`, `styles.css` — responsive interface and accessible controls
- `src/main.js` — canvas animation, interaction, controls, charts, history, and export
- `src/probability.js` — seeded PRNG, binomial model, and fast outcome simulation
- `src/statistics.js` — observed distribution statistics
- `tests/probability.test.js` — deterministic math and statistics checks

Each ball gets a deterministic random stream derived from the seed and its ball number. Animated paths and accelerated outcomes both use the same independent left/right decisions; changing rows or probability clears the active sample so the displayed empirical and theoretical distributions share one configuration.
