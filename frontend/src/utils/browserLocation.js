export const getBrowserLocation = () => new Promise((resolve, reject) => {
  if (!navigator.geolocation) {
    reject(new Error('Browser geolocation is unavailable'));
    return;
  }

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const { latitude, longitude } = coords;
      if (
        !Number.isFinite(latitude)
        || !Number.isFinite(longitude)
        || latitude < -90
        || latitude > 90
        || longitude < -180
        || longitude > 180
      ) {
        reject(new Error('Browser returned invalid location coordinates'));
        return;
      }
      resolve({ latitude, longitude });
    },
    (error) => reject(error),
    { enableHighAccuracy: true, maximumAge: 60_000, timeout: 10_000 },
  );
});
