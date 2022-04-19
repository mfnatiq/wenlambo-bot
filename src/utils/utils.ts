export const numberWithCommas = (s: string) => {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};
