<script lang="ts">
  import artist from "#lib/artist.png";
  import { mount_underwater } from "#lib/underwater.js";
  import { onMount } from "svelte";

  let canvas: HTMLCanvasElement;

  onMount(() => mount_underwater(canvas, artist));
</script>

<div class="background" style:--image="url({artist})">
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .background {
    position: fixed;
    inset: 0;
    background-image: var(--image);
    background-color: #073044;
    background-position: center;
    background-size: cover;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
    opacity: 0;
  }
</style>
