import exifr from "https://cdn.jsdelivr.net/npm/exifr@7/dist/full.esm.js";

// Wait for MapKit to be ready
function waitForMapKit() {
  return new Promise((resolve) => {
    if (window.mapKitLoaded) {
      resolve();
    } else {
      const checkInterval = setInterval(() => {
        if (window.mapKitLoaded) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 50);
    }
  });
}

await waitForMapKit();
console.log("script.js loaded - MapKit is ready");

// Date formatting
function formatDate(date) {
  const options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  return date.toLocaleDateString("en-US", options);
}

function getDateString(date) {
  const month = date.toLocaleString("en-US", { month: "short" }).toLowerCase();
  const day = date.getDate();
  return `${month}_${day}`;
}

const today = new Date();
const yesterday = new Date(today);
yesterday.setDate(yesterday.getDate() - 1);

const todayStr = getDateString(today);
const yesterdayStr = getDateString(yesterday);

document.getElementById("current-date").textContent = formatDate(today);
document.getElementById("game-date").textContent = formatDate(today);
document.getElementById("results-date").textContent = formatDate(today);

// Photo paths
const todayGamePhoto = `images/${todayStr}_game.JPG`;
const todayPostPhoto = `images/${todayStr}_post.JPG`;
const yesterdayGamePhoto = `images/${yesterdayStr}_game.JPG`;

// Global variables
let map, resultsMap, tutorialMap;
let userAnnotation = null;
let correctLocation = null;
let userGuess = null;
let currentMapType = "hybrid";
let tutorialMapType = "hybrid";
let tutorialAnnotation = null;
let tutorialCorrectLocation = null;
let tutorialGuess = null;
let gameZoomist = null;
let resultsZoomist = null;
let tutorialZoomist = null;
let showingPostPhoto = false;
let tutorialOpen = false;
let tutorialLoaded = false;

// Helper: Size a container width based on image aspect ratio to fill its height
function sizePhotoContainer(container, imgSrc) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const aspectRatio = img.naturalWidth / img.naturalHeight;
      const availableHeight =
        container.parentElement.clientHeight || container.clientHeight;
      const width = Math.round(availableHeight * aspectRatio);
      container.style.width = width + "px";
      resolve({ width, height: availableHeight, aspectRatio });
    };
    img.onerror = () => {
      container.style.width = "45%";
      resolve(null);
    };
    img.src = imgSrc;
  });
}

function getMapKitType(typeString) {
  switch (typeString) {
    case "satellite":
      return mapkit.Map.MapTypes.Satellite;
    case "hybrid":
      return mapkit.Map.MapTypes.Hybrid;
    default:
      return mapkit.Map.MapTypes.Standard;
  }
}

function initMap(
  mapElement,
  centerLat,
  centerLng,
  options = {},
  mapTypeOverride = null,
) {
  const center = new mapkit.Coordinate(centerLat, centerLng);
  const mapTypeToUse = mapTypeOverride || currentMapType;

  const defaultOptions = {
    center: center,
    region: new mapkit.CoordinateRegion(
      center,
      new mapkit.CoordinateSpan(0.01, 0.01),
    ),
    mapType: getMapKitType(mapTypeToUse),
    showsMapTypeControl: false,
    showsZoomControl: true,
    showsUserLocationControl: false,
    showsCompass: mapkit.FeatureVisibility.Hidden,
    isScrollEnabled: true,
    isZoomEnabled: true,
    ...options,
  };

  return new mapkit.Map(mapElement, defaultOptions);
}

// Screen navigation
function showScreen(screenId) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  document.getElementById(screenId).classList.add("active");
}

// Logo click handlers
document.getElementById("game-logo").onclick = () => {
  showScreen("landing-screen");
  if (map && userAnnotation) map.removeAnnotation(userAnnotation);
  userAnnotation = null;
  userGuess = null;
  document.getElementById("guess-btn").disabled = true;
  document.getElementById("guess-btn").textContent = "Place a pin to guess";
  if (gameZoomist) {
    gameZoomist.destroy();
    gameZoomist = null;
  }
};

document.getElementById("results-logo").onclick = () => {
  showScreen("landing-screen");
  if (map && userAnnotation) map.removeAnnotation(userAnnotation);
  userAnnotation = null;
  userGuess = null;
  document.getElementById("guess-btn").disabled = true;
  document.getElementById("guess-btn").textContent = "Place a pin to guess";
  if (gameZoomist) {
    gameZoomist.destroy();
    gameZoomist = null;
  }
  if (resultsZoomist) {
    resultsZoomist.destroy();
    resultsZoomist = null;
  }
};

// ========== TUTORIAL SLIDE-IN ==========
const landingContent = document.getElementById("landing-content");
const tutorialPanel = document.getElementById("tutorial-panel");
const infoBtn = document.getElementById("info-btn");

infoBtn.onclick = () => {
  if (tutorialOpen) {
    // Close tutorial
    landingContent.classList.remove("slid");
    tutorialPanel.classList.remove("open");
    tutorialOpen = false;
    infoBtn.textContent = "How to Play";
  } else {
    // Open tutorial
    landingContent.classList.add("slid");
    tutorialPanel.classList.add("open");
    tutorialOpen = true;
    infoBtn.textContent = "Close Tutorial";

    // Load tutorial content after transition if not yet loaded
    if (!tutorialLoaded) {
      setTimeout(() => loadTutorial(), 550);
    } else {
      // Re-size photo col in case window resized
      setTimeout(() => {
        const photoCol = document.getElementById("tutorial-photo-col");
        sizePhotoContainer(photoCol, yesterdayGamePhoto);
      }, 550);
    }
  }
};

// Load tutorial
async function loadTutorial() {
  try {
    const tutorialImg = document.getElementById("tutorial-image");
    tutorialImg.src = yesterdayGamePhoto;

    // Size the photo column by aspect ratio
    const photoCol = document.getElementById("tutorial-photo-col");
    await sizePhotoContainer(photoCol, yesterdayGamePhoto);

    // Initialize Zoomist
    setTimeout(() => {
      if (tutorialZoomist) tutorialZoomist.destroy();
      tutorialZoomist = new Zoomist(".tutorial-zoomist", {
        maxScale: 4,
        bounds: true,
        slider: false,
        zoomer: false,
      });
    }, 200);

    const gps = await exifr.gps(yesterdayGamePhoto);

    if (gps) {
      tutorialCorrectLocation = new mapkit.Coordinate(
        gps.latitude,
        gps.longitude,
      );

      if (!tutorialMap) {
        tutorialMap = initMap(
          "tutorial-map",
          42.3398,
          -71.0892,
          {
            region: new mapkit.CoordinateRegion(
              new mapkit.Coordinate(42.3398, -71.0892),
              new mapkit.CoordinateSpan(0.02, 0.02),
            ),
          },
          tutorialMapType,
        );

        tutorialMap.addEventListener("single-tap", (event) => {
          const coordinate = event.pointOnPage;
          const mapCoordinate =
            tutorialMap.convertPointOnPageToCoordinate(coordinate);
          placeTutorialMarker(mapCoordinate);
        });
      }

      document.getElementById("tutorial-map-type-btn").onclick = () => {
        const btn = document.getElementById("tutorial-map-type-btn");
        if (tutorialMapType === "standard") {
          tutorialMapType = "satellite";
          btn.textContent = "Hybrid";
        } else if (tutorialMapType === "satellite") {
          tutorialMapType = "hybrid";
          btn.textContent = "Standard";
        } else {
          tutorialMapType = "standard";
          btn.textContent = "Satellite";
        }
        if (tutorialMap) tutorialMap.mapType = getMapKitType(tutorialMapType);
      };

      document.getElementById("tutorial-guess-btn").onclick = () => {
        if (!tutorialGuess || !tutorialCorrectLocation) return;
        const distance = calculateDistance(
          tutorialGuess,
          tutorialCorrectLocation,
        );
        const score = calculateScore(distance);
        showTutorialResult(score, distance);
      };

      tutorialLoaded = true;
    } else {
      console.error("No GPS data found in yesterday's photo");
    }
  } catch (error) {
    console.error("Error loading tutorial:", error);
  }
}

function placeTutorialMarker(coordinate) {
  if (tutorialAnnotation) tutorialMap.removeAnnotation(tutorialAnnotation);

  tutorialAnnotation = new mapkit.MarkerAnnotation(coordinate, {
    color: "#cc0000",
    title: "Your Guess",
    glyphText: "📍",
  });

  tutorialMap.addAnnotation(tutorialAnnotation);
  tutorialGuess = coordinate;

  const guessBtn = document.getElementById("tutorial-guess-btn");
  guessBtn.disabled = false;
  guessBtn.textContent = "Submit Guess";
}

function showTutorialResult(score, distance) {
  // Hide guess button, show score, add class to bottom bar
  document.getElementById("tutorial-guess-btn").style.display = "none";
  const bottomBar = document.querySelector(".tutorial-map-bottom");
  bottomBar.classList.add("show-score");
  const scoreSection = document.getElementById("tutorial-score-section");
  scoreSection.classList.add("visible");

  document.getElementById("tutorial-score").textContent = score;

  let distanceText;
  if (distance < 1000) {
    distanceText = `${Math.round(distance)}m away`;
  } else {
    distanceText = `${(distance / 1000).toFixed(2)}km away`;
  }
  document.getElementById("tutorial-distance").textContent = distanceText;

  // Show correct + guess markers with line
  tutorialMap.removeAnnotations(tutorialMap.annotations);

  const correctMarker = new mapkit.MarkerAnnotation(tutorialCorrectLocation, {
    color: "#00FF00",
    title: "Correct Location",
    glyphText: "✓",
  });

  const guessMarker = new mapkit.MarkerAnnotation(tutorialGuess, {
    color: "#FF0000",
    title: "Your Guess",
    glyphText: "📍",
  });

  tutorialMap.addAnnotations([correctMarker, guessMarker]);

  const line = new mapkit.PolylineOverlay(
    [tutorialGuess, tutorialCorrectLocation],
    {
      style: new mapkit.Style({
        lineWidth: 2,
        lineDash: [5, 5],
        strokeColor: "#cc0000",
        strokeOpacity: 0.8,
      }),
    },
  );
  tutorialMap.addOverlay(line);

  tutorialMap.showItems([correctMarker, guessMarker], {
    padding: new mapkit.Padding(50, 50, 50, 50),
    animate: true,
  });
}

// ========== PLAY ==========
document.getElementById("play-btn").onclick = async () => {
  // Close tutorial if open
  if (tutorialOpen) {
    landingContent.classList.remove("slid");
    tutorialPanel.classList.remove("open");
    tutorialOpen = false;
    infoBtn.textContent = "How to Play";
  }
  showScreen("game-screen");
  await initGame();
};

async function initGame() {
  const gamePhoto = document.getElementById("game-photo");
  gamePhoto.src = todayGamePhoto;

  const photoContainer = document.querySelector(".game-photo-container");
  await sizePhotoContainer(photoContainer, todayGamePhoto);

  setTimeout(() => {
    if (gameZoomist) gameZoomist.destroy();
    gameZoomist = new Zoomist(".game-zoomist", {
      maxScale: 4,
      bounds: true,
      slider: false,
      zoomer: false,
    });
  }, 250);

  try {
    const gps = await exifr.gps(todayGamePhoto);
    if (gps) {
      correctLocation = new mapkit.Coordinate(gps.latitude, gps.longitude);
    } else {
      console.error("No GPS data in photo");
      alert("Error: Photo missing location data");
    }
  } catch (error) {
    console.error("Error reading EXIF:", error);
    alert(`Error loading photo data. Looking for: ${todayGamePhoto}`);
  }

  if (!map) {
    map = initMap("map", 42.3398, -71.0892, {
      region: new mapkit.CoordinateRegion(
        new mapkit.Coordinate(42.3398, -71.0892),
        new mapkit.CoordinateSpan(0.02, 0.02),
      ),
    });

    map.addEventListener("single-tap", (event) => {
      const coordinate = event.pointOnPage;
      const mapCoordinate = map.convertPointOnPageToCoordinate(coordinate);
      placeMarker(mapCoordinate);
    });
  }
}

function placeMarker(coordinate) {
  if (userAnnotation) map.removeAnnotation(userAnnotation);

  userAnnotation = new mapkit.MarkerAnnotation(coordinate, {
    color: "#cc0000",
    title: "Your Guess",
    glyphText: "📍",
  });

  map.addAnnotation(userAnnotation);
  userGuess = coordinate;

  const guessBtn = document.getElementById("guess-btn");
  guessBtn.disabled = false;
  guessBtn.textContent = "Submit Guess";
}

// Map type toggle
document.getElementById("map-type-btn").onclick = () => {
  const btn = document.getElementById("map-type-btn");
  if (currentMapType === "standard") {
    currentMapType = "satellite";
    btn.textContent = "Hybrid";
  } else if (currentMapType === "satellite") {
    currentMapType = "hybrid";
    btn.textContent = "Standard";
  } else {
    currentMapType = "standard";
    btn.textContent = "Satellite";
  }
  if (map) map.mapType = getMapKitType(currentMapType);
};

// Submit guess
document.getElementById("guess-btn").onclick = () => {
  if (!userGuess || !correctLocation) return;
  const distance = calculateDistance(userGuess, correctLocation);
  const score = calculateScore(distance);
  showResults(score, distance);
};

// Haversine
function calculateDistance(coord1, coord2) {
  const lat1 = (coord1.latitude * Math.PI) / 180;
  const lat2 = (coord2.latitude * Math.PI) / 180;
  const deltaLat = ((coord2.latitude - coord1.latitude) * Math.PI) / 180;
  const deltaLon = ((coord2.longitude - coord1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371e3 * c;
}

function calculateScore(distance) {
  if (distance <= 10) return 1000;
  return Math.round(Math.max(0, 1000 - distance * 2));
}

// Results
async function showResults(score, distance) {
  showScreen("results-screen");

  document.getElementById("score-display").textContent = score;

  let distanceText;
  if (distance < 1000) {
    distanceText = `${Math.round(distance)}m away`;
  } else {
    distanceText = `${(distance / 1000).toFixed(2)}km away`;
  }
  document.getElementById("distance-display").textContent = distanceText;

  const resultsPhoto = document.getElementById("results-photo");
  resultsPhoto.src = todayGamePhoto;
  showingPostPhoto = false;

  const toggleBtn = document.getElementById("photo-toggle-btn");
  toggleBtn.textContent = "View Zoomed Out";

  const resultsRight = document.querySelector(".results-right");
  await sizePhotoContainer(resultsRight, todayGamePhoto);

  setTimeout(() => {
    if (resultsZoomist) resultsZoomist.destroy();
    resultsZoomist = new Zoomist(".results-zoomist", {
      maxScale: 4,
      bounds: true,
      slider: false,
      zoomer: false,
    });
  }, 250);

  toggleBtn.onclick = async () => {
    if (showingPostPhoto) {
      resultsPhoto.src = todayGamePhoto;
      toggleBtn.textContent = "View Zoomed Out";
      showingPostPhoto = false;
      await sizePhotoContainer(resultsRight, todayGamePhoto);
    } else {
      resultsPhoto.src = todayPostPhoto;
      toggleBtn.textContent = "View Close Up";
      showingPostPhoto = true;
      await sizePhotoContainer(resultsRight, todayPostPhoto);
    }

    setTimeout(() => {
      if (resultsZoomist) resultsZoomist.destroy();
      resultsZoomist = new Zoomist(".results-zoomist", {
        maxScale: 4,
        bounds: true,
        slider: false,
        zoomer: false,
      });
    }, 250);
  };

  if (!resultsMap) {
    resultsMap = initMap(
      "results-map",
      correctLocation.latitude,
      correctLocation.longitude,
      {
        region: new mapkit.CoordinateRegion(
          correctLocation,
          new mapkit.CoordinateSpan(0.005, 0.005),
        ),
      },
    );
  } else {
    resultsMap.center = correctLocation;
    resultsMap.mapType = getMapKitType(currentMapType);
  }

  if (resultsMap.annotations && resultsMap.annotations.length > 0) {
    resultsMap.removeAnnotations(resultsMap.annotations);
  }

  const correctMarker = new mapkit.MarkerAnnotation(correctLocation, {
    color: "#00FF00",
    title: "Correct Location",
    glyphText: "✓",
  });

  const guessMarker = new mapkit.MarkerAnnotation(userGuess, {
    color: "#FF0000",
    title: "Your Guess",
    glyphText: "📍",
  });

  resultsMap.addAnnotations([correctMarker, guessMarker]);

  const line = new mapkit.PolylineOverlay([userGuess, correctLocation], {
    style: new mapkit.Style({
      lineWidth: 3,
      lineDash: [8, 8],
      strokeColor: "#cc0000",
      strokeOpacity: 0.8,
    }),
  });
  resultsMap.addOverlay(line);

  resultsMap.showItems([correctMarker, guessMarker], {
    padding: new mapkit.Padding(50, 50, 50, 50),
    animate: true,
  });
}
