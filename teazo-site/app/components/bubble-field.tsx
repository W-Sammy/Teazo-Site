"use client";

import { useLayoutEffect, useRef } from "react";

type BubbleFieldProps = {
  count?: number;
  className?: string;
};

type Particle = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  steerX: number;
  steerY: number;
  repelX: number;
  repelY: number;
  radius: number;
  mass: number;
  phase: number;
  drift: number;
  wobble: number;
  depth: number;
  targetX: number;
  targetY: number;
  nextTargetAt: number;
  targetAge: number;
  tint: string;
};

// These seeds give us an intentional starting composition across the page.
// After initialization, the simulation takes over and bubbles are free to roam.
const bubbleSeeds = [
  { x: 0.08, y: 0.14, radius: 34, tint: "rgba(247, 192, 211, 0.88)" },
  { x: 0.23, y: 0.28, radius: 46, tint: "rgba(245, 188, 208, 0.9)" },
  { x: 0.28, y: 0.12, radius: 28, tint: "rgba(248, 196, 214, 0.84)" },
  { x: 0.44, y: 0.08, radius: 78, tint: "rgba(250, 202, 221, 0.88)" },
  { x: 0.59, y: 0.22, radius: 32, tint: "rgba(246, 187, 208, 0.9)" },
  { x: 0.79, y: 0.16, radius: 84, tint: "rgba(245, 188, 208, 0.88)" },
  { x: 0.12, y: 0.68, radius: 26, tint: "rgba(245, 184, 206, 0.86)" },
  { x: 0.25, y: 0.56, radius: 36, tint: "rgba(246, 189, 209, 0.84)" },
  { x: 0.35, y: 0.84, radius: 62, tint: "rgba(247, 194, 214, 0.88)" },
  { x: 0.55, y: 0.58, radius: 96, tint: "rgba(246, 187, 208, 0.92)" },
  { x: 0.74, y: 0.78, radius: 42, tint: "rgba(246, 187, 208, 0.88)" },
  { x: 0.87, y: 0.54, radius: 34, tint: "rgba(246, 187, 208, 0.84)" },
  { x: 0.91, y: 0.9, radius: 30, tint: "rgba(245, 184, 206, 0.82)" },
] as const;

let persistedParticles: Particle[] = [];
let persistedWidth = 0;
let persistedHeight = 0;
let persistedCount = 0;

const BUBBLE_CRUISE_SPEED = 0.1;
const BUBBLE_MOVE_SCALE = 3.1;
const BUBBLE_HEADING_BLEND = 0.015;
const BUBBLE_VELOCITY_BLEND = 0.09;
const BUBBLE_REPULSION_INFLUENCE = 0.68;
const BUBBLE_LOCAL_CROWDING_THRESHOLD = 1.1;
const BUBBLE_RESEED_RESIZE_THRESHOLD = 0.35;

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

// Use a random heading when we need to initialize or recover a particle's motion.
function velocityAtSpeed(speed: number) {
  const angle = randomBetween(0, Math.PI * 2);

  return {
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
  };
}

// Generic viewport-safe target picker used as a fallback and for broad sampling.
function randomTarget(width: number, height: number, radius: number) {
  const horizontalPadding = radius + 18;
  const verticalPadding = radius + 18;

  return {
    x: randomBetween(horizontalPadding, width - horizontalPadding),
    y: randomBetween(verticalPadding, height - verticalPadding),
  };
}

// Sample inside a specific screen cell so target selection can reason about
// "coverage" and avoid leaving entire regions empty.
function targetInCell(
  width: number,
  height: number,
  radius: number,
  column: number,
  row: number,
  columns: number,
  rows: number,
) {
  const horizontalPadding = radius + 18;
  const verticalPadding = radius + 18;
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const cellMinX = column * cellWidth;
  const cellMaxX = (column + 1) * cellWidth;
  const cellMinY = row * cellHeight;
  const cellMaxY = (row + 1) * cellHeight;
  const innerMinX = Math.max(horizontalPadding, cellMinX + cellWidth * 0.18);
  const innerMaxX = Math.min(
    width - horizontalPadding,
    cellMaxX - cellWidth * 0.18,
  );
  const innerMinY = Math.max(verticalPadding, cellMinY + cellHeight * 0.18);
  const innerMaxY = Math.min(
    height - verticalPadding,
    cellMaxY - cellHeight * 0.18,
  );
  const fallbackX = Math.max(
    horizontalPadding,
    Math.min(width - horizontalPadding, cellMinX + cellWidth * 0.5),
  );
  const fallbackY = Math.max(
    verticalPadding,
    Math.min(height - verticalPadding, cellMinY + cellHeight * 0.5),
  );

  return {
    x: innerMinX < innerMaxX ? randomBetween(innerMinX, innerMaxX) : fallbackX,
    y: innerMinY < innerMaxY ? randomBetween(innerMinY, innerMaxY) : fallbackY,
  };
}

// Score a candidate destination by how much breathing room it gives this bubble.
// We compare against both where other bubbles are now and where they are headed,
// so bubbles do not all chase the same open spot.
function scoreTargetCandidate(
  candidateX: number,
  candidateY: number,
  radius: number,
  particles: Particle[],
  particleId: number,
) {
  let minPositionClearance = Number.POSITIVE_INFINITY;
  let averagePositionClearance = 0;
  let minTargetClearance = Number.POSITIVE_INFINITY;
  let averageTargetClearance = 0;
  let neighborCount = 0;

  for (const other of particles) {
    if (other.id === particleId) {
      continue;
    }

    const positionClearance =
      Math.hypot(candidateX - other.x, candidateY - other.y) -
      (radius + other.radius);
    const targetClearance =
      Math.hypot(candidateX - other.targetX, candidateY - other.targetY) -
      (radius + other.radius * 0.9);

    minPositionClearance = Math.min(minPositionClearance, positionClearance);
    averagePositionClearance += positionClearance;
    minTargetClearance = Math.min(minTargetClearance, targetClearance);
    averageTargetClearance += targetClearance;
    neighborCount += 1;
  }

  if (neighborCount === 0) {
    return Number.POSITIVE_INFINITY;
  }

  const averagePosition = averagePositionClearance / neighborCount;
  const averageTarget = averageTargetClearance / neighborCount;

  return (
    minPositionClearance * 2.5 +
    averagePosition * 0.34 +
    minTargetClearance * 2.1 +
    averageTarget * 0.24
  );
}

// Rather than choosing a new destination from pure randomness, inspect cells
// across the viewport and keep the best-scoring candidate from the emptier areas.
function pickSpreadOutTarget(
  width: number,
  height: number,
  radius: number,
  particles: Particle[],
  particleId: number,
) {
  const columns = Math.max(3, Math.min(6, Math.round(width / 300)));
  const rows = Math.max(4, Math.min(7, Math.round(height / 220)));
  let bestCandidate = randomTarget(width, height, radius);
  let bestScore = -Infinity;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      for (let sample = 0; sample < 2; sample += 1) {
        const candidate = targetInCell(
          width,
          height,
          radius,
          column,
          row,
          columns,
          rows,
        );
        const score =
          scoreTargetCandidate(
            candidate.x,
            candidate.y,
            radius,
            particles,
            particleId,
          ) + randomBetween(0, 3);

        if (!Number.isFinite(score)) {
          return candidate;
        }

        if (score > bestScore) {
          bestScore = score;
          bestCandidate = candidate;
        }
      }
    }
  }

  return bestCandidate;
}

// Keep startup motion local so bubbles do not all immediately drift toward some
// far-away random point on first render.
function initialTarget(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const horizontalPadding = radius + 18;
  const verticalPadding = radius + 18;
  const driftRangeX = Math.max(48, width * 0.08);
  const driftRangeY = Math.max(42, height * 0.07);

  return {
    x: Math.max(
      horizontalPadding,
      Math.min(
        width - horizontalPadding,
        x + randomBetween(-driftRangeX, driftRangeX),
      ),
    ),
    y: Math.max(
      verticalPadding,
      Math.min(
        height - verticalPadding,
        y + randomBetween(-driftRangeY, driftRangeY),
      ),
    ),
  };
}

// Estimate whether a bubble's current target is becoming crowded by nearby bubbles
// or by other bubbles targeting the same neighborhood.
function currentTargetCrowding(particle: Particle, particles: Particle[]) {
  let crowding = 0;

  for (const other of particles) {
    if (other.id === particle.id) {
      continue;
    }

    const positionDistance = Math.hypot(
      particle.targetX - other.x,
      particle.targetY - other.y,
    );
    const targetDistance = Math.hypot(
      particle.targetX - other.targetX,
      particle.targetY - other.targetY,
    );
    const positionInfluenceRadius = particle.radius + other.radius + 170;
    const targetInfluenceRadius = particle.radius + other.radius + 210;
    const positionPressure = Math.max(0, 1 - positionDistance / positionInfluenceRadius);
    const targetPressure = Math.max(0, 1 - targetDistance / targetInfluenceRadius);

    crowding += positionPressure * 1.2 + targetPressure * 0.95;
  }

  return crowding;
}

// Separate from target crowding, this measures whether the bubble itself is
// currently sitting inside a packed area and should look for a better region.
function currentBubbleCrowding(particle: Particle, particles: Particle[]) {
  let crowding = 0;

  for (const other of particles) {
    if (other.id === particle.id) {
      continue;
    }

    const distance = Math.hypot(particle.x - other.x, particle.y - other.y);
    const influenceRadius =
      particle.radius +
      other.radius +
      Math.min(particle.radius, other.radius) * 1.4 +
      170;
    const pressure = Math.max(0, 1 - distance / influenceRadius);

    crowding += pressure * 1.35;
  }

  return crowding;
}

function createParticle(width: number, height: number, id: number): Particle {
  const seed = bubbleSeeds[id % bubbleSeeds.length];
  const scaledRadius = Math.max(18, Math.min(seed.radius, width * 0.14));
  const x = Math.max(scaledRadius, Math.min(width - scaledRadius, seed.x * width));
  const y = Math.max(
    scaledRadius,
    Math.min(height - scaledRadius, seed.y * height),
  );
  const target = initialTarget(x, y, width, height, scaledRadius);
  const directionX = target.x - x;
  const directionY = target.y - y;
  const directionLength = Math.hypot(directionX, directionY);

  // Start with velocity already pointed roughly toward the first local target.
  // That makes the first few seconds feel deliberate instead of jittery.
  const velocity =
    directionLength > 0.001
      ? {
          vx: (directionX / directionLength) * BUBBLE_CRUISE_SPEED,
          vy: (directionY / directionLength) * BUBBLE_CRUISE_SPEED,
        }
      : velocityAtSpeed(BUBBLE_CRUISE_SPEED);

  return {
    id,
    x,
    y,
    vx: velocity.vx,
    vy: velocity.vy,
    steerX: velocity.vx / BUBBLE_CRUISE_SPEED,
    steerY: velocity.vy / BUBBLE_CRUISE_SPEED,
    repelX: 0,
    repelY: 0,
    radius: scaledRadius,
    mass: scaledRadius * 0.14,
    phase: randomBetween(0, Math.PI * 2),
    drift: randomBetween(0.45, 1.1),
    wobble: randomBetween(0.65, 1.35),
    depth: randomBetween(0.5, 1),
    targetX: target.x,
    targetY: target.y,
    nextTargetAt: randomBetween(4000, 11000),
    targetAge: 0,
    tint: seed.tint,
  };
}

export function BubbleField({
  count = 18,
  className,
}: BubbleFieldProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bubbleRefs = useRef<Array<HTMLDivElement | null>>([]);
  const particlesRef = useRef<Particle[]>([]);
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const visibleCount = Math.min(count, bubbleSeeds.length);

  useLayoutEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    let width = container.clientWidth;
    let height = container.clientHeight;

    const paintParticle = (particle: Particle, time: number) => {
      const element = bubbleRefs.current[particle.id];

      if (!element) {
        return;
      }

      // Slight non-uniform scaling keeps the bubbles from feeling like rigid SVGs.
      const stretchX =
        1 + Math.sin(time * 0.00048 * particle.wobble + particle.phase) * 0.034;
      const stretchY =
        1 + Math.cos(time * 0.00056 * particle.wobble + particle.phase) * 0.05;

      element.style.width = `${particle.radius * 2}px`;
      element.style.height = `${particle.radius * 2}px`;
      element.style.transform = `translate3d(${particle.x - particle.radius}px, ${
        particle.y - particle.radius
      }px, 0) scale(${stretchX}, ${stretchY})`;
      element.style.opacity = `${0.8 + particle.depth * 0.18}`;
      element.style.filter = `blur(${(1 - particle.depth) * 0.18}px)`;
      element.style.backgroundColor = particle.tint;
    };

    const initializeParticles = () => {
      width = container.clientWidth;
      height = container.clientHeight;

      if (width <= 0 || height <= 0) {
        return;
      }

      if (
        persistedParticles.length === visibleCount &&
        persistedCount === visibleCount &&
        persistedWidth === width &&
        persistedHeight === height
      ) {
        particlesRef.current = persistedParticles;
      } else {
        const canScaleExistingParticles =
          persistedParticles.length === visibleCount &&
          persistedCount === visibleCount &&
          persistedWidth > 0 &&
          persistedHeight > 0;

        if (canScaleExistingParticles) {
          const widthChange = Math.abs(width - persistedWidth) / persistedWidth;
          const heightChange = Math.abs(height - persistedHeight) / persistedHeight;

          if (
            widthChange <= BUBBLE_RESEED_RESIZE_THRESHOLD &&
            heightChange <= BUBBLE_RESEED_RESIZE_THRESHOLD
          ) {
            const scaleX = width / persistedWidth;
            const scaleY = height / persistedHeight;

            persistedParticles = persistedParticles.map((particle) => ({
              ...particle,
              x: particle.x * scaleX,
              y: particle.y * scaleY,
              targetX: particle.targetX * scaleX,
              targetY: particle.targetY * scaleY,
            }));
          } else {
            persistedParticles = Array.from({ length: visibleCount }, (_, index) =>
              createParticle(width, height, index),
            );
          }
        } else {
          persistedParticles = Array.from({ length: visibleCount }, (_, index) =>
            createParticle(width, height, index),
          );
        }

        persistedWidth = width;
        persistedHeight = height;
        persistedCount = visibleCount;
        particlesRef.current = persistedParticles;
      }

      lastTimeRef.current = 0;
      const initialPaintTime = window.performance.now();

      for (const particle of particlesRef.current) {
        paintParticle(particle, initialPaintTime);
      }
    };

    const step = (time: number) => {
      const particles = particlesRef.current;

      if (!lastTimeRef.current) {
        lastTimeRef.current = time;
      }

      const dt = Math.min((time - lastTimeRef.current) / 16.667, 1.4);
      lastTimeRef.current = time;

      // Phase 1: update each bubble's desired heading based on its target,
      // ambient flow, and whether its current area is becoming too crowded.
      for (const particle of particles) {
        particle.targetAge += dt * 16.667;
        particle.repelX = 0;
        particle.repelY = 0;

        const distanceToTarget =
          Math.hypot(particle.targetX - particle.x, particle.targetY - particle.y) ||
          0.001;
        const targetCrowding = currentTargetCrowding(particle, particles);
        const localCrowding = currentBubbleCrowding(particle, particles);
        const crowdedTarget = particle.targetAge > 1800 && targetCrowding > 1.4;
        const crowdedPocket =
          particle.targetAge > 1200 &&
          localCrowding > BUBBLE_LOCAL_CROWDING_THRESHOLD;

        if (
          time > particle.nextTargetAt ||
          distanceToTarget < Math.max(34, particle.radius * 0.52) ||
          crowdedTarget ||
          crowdedPocket
        ) {
          const nextTarget = pickSpreadOutTarget(
            width,
            height,
            particle.radius,
            particles,
            particle.id,
          );
          particle.targetX = nextTarget.x;
          particle.targetY = nextTarget.y;
          particle.nextTargetAt = time + randomBetween(5000, 14000);
          particle.targetAge = 0;
        }

        // Blend directional intent slowly so bubbles arc through the liquid
        // instead of snapping toward each new destination.
        const directionX = (particle.targetX - particle.x) / distanceToTarget;
        const directionY = (particle.targetY - particle.y) / distanceToTarget;
        const flowX =
          Math.sin(time * 0.000055 * particle.drift + particle.phase * 1.35) *
            0.14 +
          Math.cos(time * 0.000032 * (particle.wobble + 0.4) + particle.phase) *
            0.08;
        const flowY =
          Math.cos(time * 0.000048 * particle.wobble + particle.phase * 0.82) *
            0.08 +
          Math.sin(time * 0.000028 * (particle.drift + 0.35) + particle.phase) *
            0.06 -
          0.06 * (1.1 - particle.depth);

        const desiredDirectionX = directionX + flowX;
        const desiredDirectionY = directionY + flowY;
        const desiredMagnitude =
          Math.hypot(desiredDirectionX, desiredDirectionY) || 0.001;
        const desiredSteerX = desiredDirectionX / desiredMagnitude;
        const desiredSteerY = desiredDirectionY / desiredMagnitude;

        particle.steerX +=
          (desiredSteerX - particle.steerX) * BUBBLE_HEADING_BLEND * dt;
        particle.steerY +=
          (desiredSteerY - particle.steerY) * BUBBLE_HEADING_BLEND * dt;

        const steerMagnitude = Math.hypot(particle.steerX, particle.steerY) || 0.001;

        particle.steerX /= steerMagnitude;
        particle.steerY /= steerMagnitude;
      }

      // Phase 2: accumulate soft separation forces. This is not a hard collision
      // bounce; it acts more like personal space that grows stronger as bubbles
      // drift too close together.
      for (let i = 0; i < particles.length; i += 1) {
        for (let j = i + 1; j < particles.length; j += 1) {
          const first = particles[i];
          const second = particles[j];
          const dx = second.x - first.x;
          const dy = second.y - first.y;
          const distance = Math.hypot(dx, dy) || 0.001;
          const minimumDistance = first.radius + second.radius + 4;
          const comfortDistance =
            minimumDistance +
            Math.min(first.radius, second.radius) * 1.6 +
            125;

          if (distance >= comfortDistance) {
            continue;
          }

          const normalX = dx / distance;
          const normalY = dy / distance;
          const totalMass = first.mass + second.mass;
          const firstShare = second.mass / totalMass;
          const secondShare = first.mass / totalMass;
          const closeness = (comfortDistance - distance) / comfortDistance;
          const repelForce = closeness * closeness * 0.1;

          first.repelX -= normalX * repelForce * firstShare;
          first.repelY -= normalY * repelForce * firstShare;
          second.repelX += normalX * repelForce * secondShare;
          second.repelY += normalY * repelForce * secondShare;

          // If two bubbles still overlap, gently separate them so they do not clip.
          if (distance < minimumDistance) {
            const overlap = minimumDistance - distance;
            const settleDistance = overlap * 0.28;

            first.x -= normalX * settleDistance * firstShare;
            first.y -= normalY * settleDistance * firstShare;
            second.x += normalX * settleDistance * secondShare;
            second.y += normalY * settleDistance * secondShare;
          }
        }
      }

      // Phase 3: turn the desired heading plus repulsion into actual movement,
      // then clamp to our shared cruise speed for a calm, uniform drift.
      for (const particle of particles) {
        const combinedHeadingX =
          particle.steerX + particle.repelX * BUBBLE_REPULSION_INFLUENCE;
        const combinedHeadingY =
          particle.steerY + particle.repelY * BUBBLE_REPULSION_INFLUENCE;
        const combinedMagnitude =
          Math.hypot(combinedHeadingX, combinedHeadingY) || 0.001;
        const desiredVx =
          (combinedHeadingX / combinedMagnitude) * BUBBLE_CRUISE_SPEED;
        const desiredVy =
          (combinedHeadingY / combinedMagnitude) * BUBBLE_CRUISE_SPEED;

        particle.vx += (desiredVx - particle.vx) * BUBBLE_VELOCITY_BLEND * dt;
        particle.vy += (desiredVy - particle.vy) * BUBBLE_VELOCITY_BLEND * dt;

        particle.x += particle.vx * dt * BUBBLE_MOVE_SCALE;
        particle.y += particle.vy * dt * BUBBLE_MOVE_SCALE;

        const margin = 14;

        // Screen edges still push bubbles back in, but with a soft response so
        // the boundaries do not feel like hard pinball walls.
        if (particle.x - particle.radius < margin) {
          particle.x = margin + particle.radius;
          particle.vx = Math.abs(particle.vx) * 0.22;
        }

        if (particle.x + particle.radius > width - margin) {
          particle.x = width - margin - particle.radius;
          particle.vx = -Math.abs(particle.vx) * 0.22;
        }

        if (particle.y - particle.radius < margin) {
          particle.y = margin + particle.radius;
          particle.vy = Math.abs(particle.vy) * 0.18;
        }

        if (particle.y + particle.radius > height - margin) {
          particle.y = height - margin - particle.radius;
          particle.vy = -Math.abs(particle.vy) * 0.22;
        }

        const speed = Math.hypot(particle.vx, particle.vy);

        if (speed > 0.0001) {
          particle.vx = (particle.vx / speed) * BUBBLE_CRUISE_SPEED;
          particle.vy = (particle.vy / speed) * BUBBLE_CRUISE_SPEED;
        } else {
          const velocity = velocityAtSpeed(BUBBLE_CRUISE_SPEED);
          particle.vx = velocity.vx;
          particle.vy = velocity.vy;
        }

        paintParticle(particle, time);
      }

      frameRef.current = window.requestAnimationFrame(step);
    };

    initializeParticles();

    // Re-initialize on resize so coverage and spacing stay proportional to the
    // new viewport instead of stretching the old particle layout.
    const resizeObserver = new ResizeObserver(() => {
      initializeParticles();
    });

    resizeObserver.observe(container);
    frameRef.current = window.requestAnimationFrame(step);

    return () => {
      resizeObserver.disconnect();

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [visibleCount]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={[
        "pointer-events-none fixed inset-0 overflow-hidden",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* These divs are painted imperatively for animation performance. */}
      {Array.from({ length: visibleCount }).map((_, index) => (
        <div
          key={index}
          ref={(element) => {
            bubbleRefs.current[index] = element;
          }}
          className="absolute rounded-full border border-white/70 bg-[radial-gradient(circle_at_28%_24%,rgba(255,255,255,0.62),rgba(255,255,255,0.16)_34%,rgba(255,255,255,0)_44%),radial-gradient(circle_at_72%_76%,rgba(255,255,255,0.02),rgba(255,255,255,0.28)_84%)] shadow-[inset_-24px_-24px_38px_rgba(255,255,255,0.24),inset_16px_16px_24px_rgba(255,255,255,0.28),0_0_0_1px_rgba(247,190,209,0.24)] will-change-transform"
        />
      ))}
    </div>
  );
}
