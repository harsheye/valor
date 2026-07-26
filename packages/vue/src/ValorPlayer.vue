<template>
  <div ref="container" class="valor-player-container" style="width: 100%; height: 100%;"></div>
</template>

<script lang="ts">
import { defineComponent, onMounted, onBeforeUnmount, ref } from 'vue';
import { MediaPlayer } from '@our-player/sdk';

export default defineComponent({
  name: 'ValorPlayer',
  props: {
    media: String,
    controls: Object,
    theme: Object,
    domain: String
  },
  emits: ['ready', 'play', 'pause', 'timeupdate', 'seek'],
  setup(props, { emit }) {
    const container = ref<HTMLElement | null>(null);
    let player: MediaPlayer | null = null;

    onMounted(() => {
      if (container.value) {
        player = new MediaPlayer({
          container: container.value,
          media: props.media,
          controls: props.controls,
          theme: props.theme,
          domain: props.domain
        });

        player.on('ready', () => emit('ready'));
        player.on('play', () => emit('play'));
        player.on('pause', () => emit('pause'));
        player.on('time_update', (data: any) => emit('timeupdate', data));
        player.on('seek', (data: any) => emit('seek', data));
      }
    });

    onBeforeUnmount(() => {
      if (player) {
        player.destroy();
        player = null;
      }
    });

    return { container };
  }
});
</script>
