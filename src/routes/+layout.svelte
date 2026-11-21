<script lang="ts">
  import "../app.css";

  import artist from "#lib/artist.png";
  import type { LayoutProps } from "./$types";

  const { children }: LayoutProps = $props();
</script>

<svelte:head>
  <title>ARTIDIVE</title>
  <meta name="color-scheme" content="light" />
  <meta name="robots" content="noindex, nofollow" />
  <link rel="icon" type="image/png" href={artist} />
</svelte:head>

{@render children()}
