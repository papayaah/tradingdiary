import { Composition } from 'remotion';
import { PatternPromo } from './compositions/PatternPromo';
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
    </>
  );
}
