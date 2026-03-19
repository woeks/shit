import { ref } from 'vue';

const getDefaultFullscreen = () => (typeof window !== 'undefined' ? window.innerWidth < 960 : false);

export const useDialogFullscreen = () => {
  const fullscreen = ref(getDefaultFullscreen());

  const toggleFullscreen = () => {
    fullscreen.value = !fullscreen.value;
  };

  return {
    fullscreen,
    toggleFullscreen
  };
};
