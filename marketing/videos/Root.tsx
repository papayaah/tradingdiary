import { Composition } from 'remotion';
import React from 'react';
import { AnalyticsPromo } from './compositions/AnalyticsPromo';
import { AutoScanPromo } from './compositions/AutoScanPromo';
import { ImportPromo } from './compositions/ImportPromo';
import { PatternPromo } from './compositions/PatternPromo';
import { ProductMashupPromo } from './compositions/ProductMashupPromo';
import { ReplayPromo } from './compositions/ReplayPromo';
import { patternPromos } from './patterns';

const FPS = 30;
const DURATION_IN_FRAMES = 330;
const WIDTH = 1080;
const HEIGHT = 1920;

export function VideoRoot() {
  return (
    <>
      {/* Pattern Promos (Dark & Light) */}
      {patternPromos.map((pattern) => (
        <React.Fragment key={pattern.id}>
          <Composition
            id={pattern.compositionId}
            component={PatternPromo}
            durationInFrames={DURATION_IN_FRAMES}
            fps={FPS}
            width={WIDTH}
            height={HEIGHT}
            defaultProps={{ pattern, themeMode: 'dark' }}
          />
          <Composition
            id={`${pattern.compositionId}Light`}
            component={PatternPromo}
            durationInFrames={DURATION_IN_FRAMES}
            fps={FPS}
            width={WIDTH}
            height={HEIGHT}
            defaultProps={{ pattern, themeMode: 'light' }}
          />
        </React.Fragment>
      ))}

      {/* Import Promo */}
      <Composition
        id="ImportPromo"
        component={ImportPromo}
        durationInFrames={360}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ themeMode: 'dark' }}
      />
      <Composition
        id="ImportPromoLight"
        component={ImportPromo}
        durationInFrames={360}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ themeMode: 'light' }}
      />

      {/* Replay Promo */}
      <Composition
        id="ReplayPromo"
        component={ReplayPromo}
        durationInFrames={330}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ themeMode: 'dark' }}
      />
      <Composition
        id="ReplayPromoLight"
        component={ReplayPromo}
        durationInFrames={330}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ themeMode: 'light' }}
      />

      {/* Analytics Promo */}
      <Composition
        id="AnalyticsPromo"
        component={AnalyticsPromo}
        durationInFrames={330}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ themeMode: 'dark' }}
      />
      <Composition
        id="AnalyticsPromoLight"
        component={AnalyticsPromo}
        durationInFrames={330}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ themeMode: 'light' }}
      />

      {/* Master Mashup Promo */}
      <Composition
        id="ProductMashupPromo"
        component={ProductMashupPromo}
        durationInFrames={900}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ themeMode: 'dark' }}
      />
      <Composition
        id="ProductMashupPromoLight"
        component={ProductMashupPromo}
        durationInFrames={900}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ themeMode: 'light' }}
      />

      {/* Auto Scan Promo */}
      <Composition
        id="AutoScanPromo"
        component={AutoScanPromo}
        durationInFrames={330}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ themeMode: 'dark' }}
      />
      <Composition
        id="AutoScanPromoLight"
        component={AutoScanPromo}
        durationInFrames={330}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ themeMode: 'light' }}
      />
    </>
  );
}
