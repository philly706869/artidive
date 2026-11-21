<script lang="ts">
  import WaterDrops from "./WaterDrops.svelte";
  import { mount_underwater } from "./renderer.js";
  import { onMount } from "svelte";

  let { src }: { src: string } = $props();
  let canvas: HTMLCanvasElement;
  let image: HTMLImageElement;
  let image_settled = $state(false);
  let shader_status = $state<"loading" | "ready" | "fallback">("loading");
  const loading = $derived(
    shader_status !== "ready" && !(shader_status === "fallback" && image_settled),
  );

  function settle_image() {
    image_settled = true;
  }

  onMount(() => {
    if (image.complete) settle_image();
    return mount_underwater(canvas, image, (status) => {
      shader_status = status;
    });
  });
</script>

<div class="background" aria-hidden="true">
  <img bind:this={image} {src} alt="" onload={settle_image} onerror={settle_image} />
  <canvas bind:this={canvas}></canvas>
  <WaterDrops />
  {#if loading}
    <div class="shimmer"></div>
  {/if}
</div>

<style>
  .background {
    position: fixed;
    inset: 0;
    background-color: #073044;
  }

  img,
  canvas,
  .shimmer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  img {
    object-fit: cover;
  }

  canvas {
    opacity: 0;
    touch-action: none;
  }

  .shimmer {
    overflow: hidden;
    background: #e8e9eb;
  }

  @media (prefers-reduced-motion: no-preference) {
    .shimmer::before {
      position: absolute;
      inset: 0 auto 0 0;
      width: 38%;
      content: "";
      background: linear-gradient(90deg, transparent, rgb(255 255 255 / 75%), transparent);
      animation: shimmer 1.05s ease-in-out infinite;
    }
  }

  @keyframes shimmer {
    from {
      transform: translateX(calc(-100% - 15vh)) skewX(-12deg);
    }

    to {
      transform: translateX(calc(100vw + 15vh)) skewX(-12deg);
    }
  }
</style>
