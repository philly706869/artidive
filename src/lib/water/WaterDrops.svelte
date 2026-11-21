<div class="drops">
  {#each Array.from({ length: 14 }, (_, i) => i) as i (i)}
    <i
      style={`--x:${(i * 61.8 + 7) % 100}%; --size:${5 + ((i * 11) % 22)}px; --duration:${15 + (i % 8)}s; --delay:-${(i * 7.31 + 2) % (15 + (i % 8))}s`}
    ></i>
  {/each}
</div>

<style>
  .drops {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .drops i {
    position: absolute;
    left: var(--x);
    bottom: -32px;
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    background: radial-gradient(ellipse at 31% 24%, #ffffffe0 0 5%, transparent 15%);
    box-shadow:
      inset 0 1px 2px #fff9,
      inset -1px -2px 3px #29728e66;
    animation: rise var(--duration) linear var(--delay) infinite;
  }

  @keyframes rise {
    50% {
      transform: translate(15px, -52vh);
    }
    to {
      transform: translate(0, calc(-100vh - 64px));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .drops i {
      animation-play-state: paused;
    }
  }
</style>
