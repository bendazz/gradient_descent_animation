# Gradient Descent Visualizer (seed)

A tiny front-end (no frameworks) canvas app. This first step renders:

- Three points with coordinates in [0, 10] × [0, 10]
- The horizontal line y = 0 in red

Light, uncluttered UI; index.html lives at the repo root.

## Run locally

Any static server works. If you have Python 3, you can use the built-in server:

```bash
python3 -m http.server 8000 --directory .
```

Then open http://localhost:8000/ in your browser and load `index.html`.

## Files

- `index.html`: root page with a canvas
- `src/js/main.js`: plain JS renders the points and red line
- `src/styles/main.css`: minimal light theme styles

## Next steps

- Add interactive controls (learning rate, iterations)
- Animate gradient descent for a simple loss (e.g., line fit or convex bowl)
- Show the loss surface and the parameter updates over time