import { Composition } from 'remotion';
import { AnalyticsPromo } from './compositions/AnalyticsPromo';
import { ImportPromo } from './compositions/ImportPromo';
import { PatternPromo } from './compositions/PatternPromo';
import { ReplayPromo } from './compositions/ReplayPromo';
import { patternPromos } from './patterns';

const FPS = 30;
const DURATION_IN_FRAMES = 330;
const WIDTH = 1080;
const HEIGHT = 1920;

export function VideoRoot() {
  return (
    <>
      {patternPromos.map((pattern) => (
        <Composition
          key={pattern.id}
          id={pattern.compositionId}
          component={PatternPromo}
          durationInFrames={DURATION_IN_FRAMES}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
          defaultProps={{ pattern }}
        />
      ))}
      <Composition
        id="ImportPromo"
        component={ImportPromo}
        durationInFrames={360}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="ReplayPromo"
        component={ReplayPromo}
        durationInFrames={330}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="AnalyticsPromo"
        component={AnalyticsPromo}
        durationInFrames={330}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
}


