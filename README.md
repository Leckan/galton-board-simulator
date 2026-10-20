# Galton Lab

Galton Lab is an interactive, browser-based simulator for exploring randomness and the binomial distribution. Watch balls move through a Galton board, compare observed outcomes with the theoretical distribution, and run experiments with different row counts and left/right probabilities.

The app uses HTML, CSS, vanilla JavaScript, and Canvas. It has no third-party JavaScript dependencies or backend. Google Fonts are loaded from Google Fonts when available; system fonts are used as a fallback.

## Run locally

Requires Python 3 to serve the static files. From the project directory, run:

```sh
npm run start
```

Then open [http://localhost:4173](http://localhost:4173). You can also serve the project with any static file server.

## Use the simulator

- Release 1, 10, 100, or 1,000 balls, or choose a built-in or custom experiment.
- Adjust the board from 5 to 20 peg rows and choose a release rate.
- Keep equal left/right odds or turn off **Symmetric** to set a custom left-turn probability.
- Use **Fast run** for large samples, or run continuously and pause the animation.
- Compare observed bin counts with the binomial expectation. Switch the histogram between counts, relative values, and percentages.
- Review mean, median, standard deviation, variance, mode, and landed range.
- Set a seed to reproduce a sequence with the same configuration. Changing the row count or probability clears the current sample.
- Export the histogram data as CSV, the run and notebook summary as JSON, or the chart as PNG.

The board's animation settings affect how balls are displayed. They do not change the probability model. **Reduce motion** calculates new outcomes without individual ball animations.

## Probability model

Each ball makes one independent left/right decision at every peg row. Its final bin is the number of right turns. With `n` rows and right-turn probability `p`, the outcome follows a binomial distribution:

```text
X ~ Binomial(n, p)
P(X = k) = C(n, k) p^k (1 - p)^(n - k)
E[X] = np
Var(X) = np(1 - p)
```

The histogram compares the sample with this theoretical distribution. Larger samples tend to track the expected proportions more closely, while individual outcomes remain random.

## Built-in experiments

- **Small beginnings:** 5 rows and 50 balls
- **Watch it settle:** 12 rows and 1,000 balls
- **Scale the sample:** 15 rows and 10,000 outcomes, calculated in fast mode
- **Big sample energy:** 20 rows and 100,000 outcomes, calculated in fast mode
- **Tip the odds:** 12 rows, 70% chance of right, and 1,000 balls
- **Custom sample:** choose any sample size from 1 to 100,000

The Learn section also includes short activities about randomness, the law of large numbers, binomial distributions, normal approximation, biased probabilities, and the central limit theorem.

## Saved data and exports

The simulator runs in your browser. It stores the recent experiment notebook (up to eight completed runs) and theme preference in local storage on that device. Use **Clear** in the notebook to remove saved runs. No account is required, and there is no application backend.

- **CSV** contains per-bin observed counts and percentages, expected probabilities, and expected counts.
- **Summary JSON** contains the current configuration, seed, statistics, bin counts, and saved notebook.
- **Chart PNG** downloads the observed-versus-expected histogram.

## Tests

Requires Node.js 18 or later. Run the probability and statistics unit tests with:

```sh
npm test
```

## Deploy to Vercel

Import the repository into Vercel and select **Other** as the framework. Leave the build command blank and set the output directory to `.`. The project is static and does not need environment variables or a server-side function. You can also deploy from the project directory with the Vercel CLI:

```sh
vercel
```

## Project structure

```text
.
├── index.html               # Page content and accessible controls
├── styles.css               # Responsive layout and themes
├── favicon.svg
├── src/
│   ├── main.js               # Canvas, interaction, charts, history, exports
│   ├── probability.js        # Seeded random generator and binomial model
│   └── statistics.js         # Statistics for observed outcomes
├── tests/
│   └── probability.test.js   # Probability and statistics tests
└── package.json
```
