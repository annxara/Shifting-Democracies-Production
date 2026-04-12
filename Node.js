class Node {
  constructor(country, years) {
    this.country = country;
    this.years = years; // array of { year, v2x_polyarchy, ... }
    this.closest = null;
    this.pos = createVector(random(width), random(height));
    this.yearDistances = {}; // keyed by year
    this.currentOffset = 0; // Current animated offset
    this.targetOffset = 0; // Target offset position
    this.easeSpeed = 0.1; // Speed of easing (0-1, higher = faster)
  }

  normalizeValue(key, value) {
    // Map different value systems to 0-1 scale
    if (key === "stfgov" || key === "stfdem") {
      // stfgov and stfdem are on 0-10 scale, normalize to 0-1
      return value / 10;
    }
    return value; // v2x_* variables already on 0-1 scale
  }

  findMatchingYear(params) {
    const tolerance = 0;

    const matchedDetails = this.years.filter((details) => {
      if (details.year === 2025) return false;

      return (
        details.stfeco !== undefined &&
        Math.abs(details.stfeco - params.stfeco) <= tolerance &&
        details.stflife !== undefined &&
        Math.abs(details.stflife - params.stflife) <= tolerance &&
        details.stfgov !== undefined &&
        Math.abs(details.stfgov - params.stfgov) <= tolerance
      );
    });

    // Store matching year for opacity highlighting, but always use first year for centering
    const matchingData = matchedDetails[0] || null;
    const matchingYear = matchingData ? matchingData.year : null;

    // Always set a year for rendering (use first year)
    const renderYear =
      this.years && this.years.length > 0 ? this.years[0].year : null;

    this.closest = {
      year: renderYear,
      data: this.years && this.years.length > 0 ? this.years[0] : null,
      matchingYear,
    };
    return this.closest;
  }
  yearMatchesParams(yearData, params) {
    const tolerance = 0;

    return (
      yearData.stfeco !== undefined &&
      Math.abs(yearData.stfeco - params.stfeco) <= tolerance &&
      yearData.stflife !== undefined &&
      Math.abs(yearData.stflife - params.stflife) <= tolerance &&
      yearData.stfgov !== undefined &&
      Math.abs(yearData.stfgov - params.stfgov) <= tolerance
    );
  }

  hasSatisfactionData(yearData) {
    return (
      yearData &&
      yearData.stfeco !== undefined &&
      yearData.stfeco !== null &&
      yearData.stflife !== undefined &&
      yearData.stflife !== null &&
      yearData.stfgov !== undefined &&
      yearData.stfgov !== null
    );
  }

  getClosestYearAndDifference(params) {
    // Find year with minimum distance to params
    let closestYear = null;
    let minDistance = Infinity;
    let avgDifference = 0;

    for (const yearData of this.years) {
      if (yearData.year === 2025) continue;
      if (
        yearData.stfeco === undefined ||
        yearData.stflife === undefined ||
        yearData.stfgov === undefined
      )
        continue;

      // Calculate euclidean distance
      const stfecoDiff = yearData.stfeco - params.stfeco;
      const stflifeDiff = yearData.stflife - params.stflife;
      const stfgovDiff = yearData.stfgov - params.stfgov;

      const distance = Math.sqrt(
        stfecoDiff * stfecoDiff +
          stflifeDiff * stflifeDiff +
          stfgovDiff * stfgovDiff,
      );

      if (distance < minDistance) {
        minDistance = distance;
        closestYear = yearData;
        // Average difference across 3 params
        avgDifference = (stfecoDiff + stflifeDiff + stfgovDiff) / 3;
      }
    }

    return { year: closestYear, avgDifference };
  }

  render(allYears, params, hasAnyMatch = true) {
    if (!this.closest || this.closest.year === null) return;

    push();

    let rectWidth = 300; // rectangle width
    let rectHeight = 60; // rectangle height
    let topOffset = 12; // Space above rectangle within its row

    translate(this.pos.x, this.pos.y + topOffset);

    // Get closest year and calculate horizontal offset based on difference
    const { avgDifference } = this.getClosestYearAndDifference(params);
    const sectionWidth = (rectWidth * 0.99) / allYears.length;

    // Check if any year matches params exactly
    let hasMatch = false;
    for (const yearData of this.years) {
      if (this.yearMatchesParams(yearData, params)) {
        hasMatch = true;
        break;
      }
    }

    // Only apply offset if there's no matching year in this country
    // Non-matching countries shift based on how close they are to params
    this.targetOffset = hasMatch ? 0 : avgDifference * 26;

    // Smoothly interpolate current offset towards target using easing
    this.currentOffset = lerp(
      this.currentOffset,
      this.targetOffset,
      this.easeSpeed,
    );

    translate(this.currentOffset, 0);

    // Create a map of year to data for quick lookup
    const yearMap = {};
    for (const yearData of this.years) {
      yearMap[yearData.year] = yearData;
    }

    const lineW = rectWidth * 0.99; // scale to rectangle width
    const lineH = rectHeight * 0.95; // scale to rectangle height
    const startX = -lineW / 2;
    const startY = -lineH / 2;

    const vdemKeys = [
      "v2x_polyarchy",
      "v2x_libdem",
      "v2x_egaldem",
      "v2x_delibdem",
      "v2x_partipdem",
      "stfdem",
    ];
    const vdemColors = [
      "orange", // v2x_polyarchy
      "blue", // v2x_libdem
      "cornflowerblue", // v2x_egaldem
      "green", // v2x_delibdem
      "violet", // v2x_partipdem
      "red", // stfdem
    ];

    //fill(255);
    noFill();
    stroke(255);
    strokeWeight(1);

    let corner = 12;

    rect(-rectWidth / 2, -rectHeight / 2, rectWidth, rectHeight, corner);

    // Draw white background for years that have satisfaction data
    noStroke();
    for (let i = 0; i < allYears.length; i++) {
      const year = allYears[i];
      const yearData = yearMap[year];
      if (yearData && this.hasSatisfactionData(yearData)) {
        const x = startX + i * sectionWidth;
        const isMatching = this.yearMatchesParams(yearData, params);

        // Full opacity for matching, reduced for non-matching
        fill(255, isMatching ? 255 : 255);

        let radius = 0;
        if (i === 0) {
          rect(x, startY, sectionWidth, lineH, corner, 0, 0, corner);
        } else if (i === allYears.length - 1) {
          rect(x, startY, sectionWidth, lineH, 0, corner, corner, 0);
        } else {
          rect(x, startY, sectionWidth, lineH);
        }
      }
    }

    // Draw light gray background for years without satisfaction data
    noStroke();
    for (let i = 0; i < allYears.length; i++) {
      const year = allYears[i];
      const yearData = yearMap[year];
      if (yearData && !this.hasSatisfactionData(yearData)) {
        const x = startX + i * sectionWidth;
        fill(170);

        if (i === 0) {
          rect(x, startY, sectionWidth, lineH, corner, 0, 0, corner);
        } else if (i === allYears.length - 1) {
          rect(x, startY, sectionWidth, lineH, 0, corner, corner, 0);
        } else {
          rect(x, startY, sectionWidth, lineH);
        }
      }
    }

    // Draw light yellow background for highlighted/matching year (only for years with satisfaction data)
    noStroke();
    for (let i = 0; i < allYears.length; i++) {
      const year = allYears[i];
      const yearData = yearMap[year];
      if (
        yearData &&
        this.hasSatisfactionData(yearData) &&
        this.yearMatchesParams(yearData, params)
      ) {
        const x = startX + i * sectionWidth;
        fill(255, 255, 150, 255);

        if (i === 0) {
          rect(x, startY, sectionWidth, lineH, corner, 0, 0, corner);
        } else if (i === allYears.length - 1) {
          rect(x, startY, sectionWidth, lineH, 0, corner, corner, 0);
        } else {
          rect(x, startY, sectionWidth, lineH);
        }
      }
    }

    // Draw light orange background for closest year in non-matching countries
    if (!hasMatch) {
      const { year: closestYearData } =
        this.getClosestYearAndDifference(params);
      if (closestYearData && this.hasSatisfactionData(closestYearData)) {
        const closestYearValue = closestYearData.year;
        for (let i = 0; i < allYears.length; i++) {
          if (allYears[i] === closestYearValue) {
            const x = startX + i * sectionWidth;
            noStroke();
            fill(255, 200, 150, 255); // Light orange

            if (i === 0) {
              rect(x, startY, sectionWidth, lineH, corner, 0, 0, corner);
            } else if (i === allYears.length - 1) {
              rect(x, startY, sectionWidth, lineH, 0, corner, corner, 0);
            } else {
              rect(x, startY, sectionWidth, lineH);
            }
            break;
          }
        }
      }
    }

    fill(255);
    textAlign(CENTER);
    textSize(10);
    text(this.country, 0, 40);

    // Draw year text above highlighted boxes
    for (let i = 0; i < allYears.length; i++) {
      const year = allYears[i];
      const yearData = yearMap[year];
      if (
        yearData &&
        this.hasSatisfactionData(yearData) &&
        this.yearMatchesParams(yearData, params)
      ) {
        const x = startX + i * sectionWidth + sectionWidth / 2;
        fill(255);
        textAlign(CENTER);
        textSize(9);
        textStyle(BOLD);
        text(year, x, startY - 5);
      }
    }

    // Draw year text above orange highlight for closest year
    if (!hasMatch) {
      const { year: closestYearData } =
        this.getClosestYearAndDifference(params);
      if (closestYearData && this.hasSatisfactionData(closestYearData)) {
        const closestYearValue = closestYearData.year;
        for (let i = 0; i < allYears.length; i++) {
          if (allYears[i] === closestYearValue) {
            const x = startX + i * sectionWidth + sectionWidth / 2;
            fill(255);
            textAlign(CENTER);
            textSize(9);
            textStyle(BOLD);
            text(closestYearValue, x, startY - 5);
            break;
          }
        }
      }
    }

    textStyle(NORMAL);

    // Draw data visualization for each variable
    noFill();
    for (let vi = 0; vi < vdemKeys.length; vi++) {
      const key = vdemKeys[vi];
      stroke(vdemColors[vi]);
      strokeWeight(1.2);

      // For stfdem, break line at gaps in satisfaction data
      if (key === "stfdem") {
        let currentShape = [];
        let lastIndex = -1;

        for (let i = 0; i < allYears.length; i++) {
          const year = allYears[i];
          const details = yearMap[year];
          if (!details || details[key] === undefined) continue;
          if (!this.hasSatisfactionData(details)) continue;

          // Check if there's a gap (missing satisfaction data years) between last point and current
          if (lastIndex !== -1) {
            let hasGap = false;
            for (let j = lastIndex + 1; j < i; j++) {
              if (
                !yearMap[allYears[j]] ||
                !this.hasSatisfactionData(yearMap[allYears[j]])
              ) {
                hasGap = true;
                break;
              }
            }

            // If gap found, draw current shape and start fresh
            if (hasGap) {
              if (currentShape.length > 0) {
                beginShape();
                for (let pt of currentShape) {
                  vertex(pt.x, pt.y);
                }
                endShape();
              }
              currentShape = [];
            }
          }

          const x = startX + (i + 0.5) * sectionWidth;
          const normalizedValue = this.normalizeValue(key, details[key]);
          const y = map(normalizedValue, 0, 1, startY + lineH, startY);
          currentShape.push({ x, y });
          lastIndex = i;
        }

        // Draw final shape
        if (currentShape.length > 0) {
          beginShape();
          for (let pt of currentShape) {
            vertex(pt.x, pt.y);
          }
          endShape();
        }
      } else {
        // For other variables, draw continuous line
        beginShape();
        for (let i = 0; i < allYears.length; i++) {
          const year = allYears[i];
          const details = yearMap[year];
          if (!details || details[key] === undefined) continue;

          const x = startX + (i + 0.5) * sectionWidth;
          const normalizedValue = this.normalizeValue(key, details[key]);
          const y = map(normalizedValue, 0, 1, startY + lineH, startY);
          vertex(x, y);
        }
        endShape();
      }
    }

    // Draw colored data points for each variable in each year
    for (let vi = 0; vi < vdemKeys.length; vi++) {
      const key = vdemKeys[vi];
      fill(vdemColors[vi]);
      noStroke();

      for (let i = 0; i < allYears.length; i++) {
        const year = allYears[i];
        const details = yearMap[year];
        if (!details || details[key] === undefined) continue;

        // Skip stfdem in years without satisfaction data
        if (key === "stfdem" && !this.hasSatisfactionData(details)) continue;

        const x = startX + (i + 0.5) * sectionWidth;
        const normalizedValue = this.normalizeValue(key, details[key]);
        const y = map(normalizedValue, 0, 1, startY + lineH, startY);
        circle(x, y, 4);
      }
    }

    // Draw vertical dividers between years (equally spaced)
    stroke(0);
    strokeWeight(0.25);
    for (let i = 1; i < allYears.length; i++) {
      const x = startX + i * sectionWidth;
      line(x, startY, x, startY + lineH);
    }

    pop(); // Close the main translate
  }

  setPosition(x, y) {
    this.pos.set(x, y);
  }
}
