# Trading Diary marketing videos

Reusable React and Remotion compositions for vertical promotional videos.
Finished GIF and MP4 assets are written to `marketing/videos/output`.

## Commands

```bash
# Preview every registered pattern composition
npm run video:studio

# Render the Consecutive Move social video
npm run video:render:consecutive

# Render a smaller GIF version
npm run video:gif:consecutive

# Render the fast IBKR import promotion
npm run video:render:import
npm run video:gif:import
```

## Structure

- `components/` contains reusable animation and branded presentation pieces.
- `patterns/` contains copy, chart data, and detector-specific configuration.
- `compositions/PatternPromo.tsx` composes a complete vertical short.
- `Root.tsx` registers a composition for every pattern configuration.
- `theme.ts` owns the marketing-video palette.

New patterns should be added as configuration under `patterns/` and registered
in `patterns/index.ts`. Shared animation or layout belongs in `components/`.
