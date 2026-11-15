import { describe, expect, it } from "vitest";

import { tidyName, tidySentence } from "./casing";

describe("tidyName", () => {
  it("title-cases a name printed in capitals", () => {
    expect(tidyName("GRILLED CHICKEN CAESAR")).toBe("Grilled Chicken Caesar");
  });

  it("leaves a name that was printed in mixed case exactly as it is", () => {
    expect(tidyName("Grilled chicken Caesar")).toBe("Grilled chicken Caesar");
    expect(tidyName("iPhone charger cake")).toBe("iPhone charger cake");
  });

  it("keeps small words small, except at either end", () => {
    expect(tidyName("CHICKEN AND WAFFLES")).toBe("Chicken and Waffles");
    expect(tidyName("TACOS AL PASTOR")).toBe("Tacos al Pastor");
    expect(tidyName("THE CORNER TABLE")).toBe("The Corner Table");
  });

  it("keeps apostrophes, hyphens and known capitals", () => {
    expect(tidyName("CHEF'S T-BONE")).toBe("Chef's T-Bone");
    expect(tidyName("BBQ PULLED PORK")).toBe("BBQ Pulled Pork");
    expect(tidyName("CRÈME BRÛLÉE")).toBe("Crème Brûlée");
  });

  it("leaves tokens with digits alone", () => {
    expect(tidyName("7UP FLOAT")).toBe("7UP Float");
  });

  it("does not touch an empty or punctuation-only name", () => {
    expect(tidyName("")).toBe("");
    expect(tidyName("—")).toBe("—");
  });
});

describe("tidySentence", () => {
  it("sentence-cases a description printed in capitals", () => {
    expect(tidySentence("SERVED WITH FRIES. ADD CHEESE FOR $2.")).toBe("Served with fries. Add cheese for $2.");
  });

  it("leaves a mixed-case description alone", () => {
    expect(tidySentence("Served with fries")).toBe("Served with fries");
  });

  it("keeps known capitals", () => {
    expect(tidySentence("SLOW COOKED IN OUR BBQ SAUCE")).toBe("Slow cooked in our BBQ sauce");
  });
});
