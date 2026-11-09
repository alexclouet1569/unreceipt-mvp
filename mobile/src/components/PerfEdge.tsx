// The perforated top edge of a receipt (DESIGN.md signature element), drawn
// as a row of half-circle bites out of the card.

import { useState } from "react";
import { View } from "react-native";
import Svg, { Path } from "react-native-svg";

export function PerfEdge({ color, background, size = 8 }: { color: string; background: string; size?: number }) {
  const [width, setWidth] = useState(0);
  const count = Math.max(1, Math.floor(width / size));
  const step = width / count;
  let d = `M0 ${size}`;
  for (let i = 0; i < count; i++) {
    const x = i * step;
    d += ` L${x} ${size} A${step / 2} ${step / 2} 0 0 1 ${x + step} ${size}`;
  }
  d += ` L${width} ${size} L${width} ${size + 1} L0 ${size + 1} Z`;

  return (
    <View style={{ height: size, backgroundColor: background }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Svg width={width} height={size + 1} style={{ position: "absolute", top: 0 }}>
          <Path d={d} fill={color} />
        </Svg>
      ) : null}
    </View>
  );
}
