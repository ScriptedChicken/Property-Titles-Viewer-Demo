// variables
var propertyTitlesLayer;
var resourceConsentsLayer;
var clickedFeature;
var geoServerURL = 'https://boredyet.pythonanywhere.com'
var map = L.map('map', {zoomSnap: 0}).setView([-41.2865, 174.7762], 20);

// add controls
const search = new GeoSearch.GeoSearchControl({
    provider: new GeoSearch.OpenStreetMapProvider(),
});

L.controlCredits({
    imageurl: 'src/img/bored_yet_logo.png',
    tooltip: 'Made by Bored Yet?',
    width: '161px',
    height: '51.8px',
    imagealt:'Bored Yet? logo',
    expandcontent: 'Interactive mapping<br/>by <a href="http://boredyet.co.nz/" target="_blank">Bored Yet?</a>',
}).addTo(map);

map.addControl(search);
map.addControl(new L.Control.Fullscreen());

// functions
function createAttributePopup (feature, layer) {
    var popupContent = "<table>";
    for (var prop in feature.properties) {
        if (feature.properties.hasOwnProperty(prop)) {
            popupContent += "<tr><th>" + prop + "</th><td>" + feature.properties[prop] + "</td></tr>";
        }
    }
    popupContent += "</table>";
    layer.bindPopup(popupContent, {
        autoPan: false
    });
}

function removeLayerIfExists(layer) {
    if (map.hasLayer(layer)) {
        map.removeLayer(layer);
    }
}

function sendFeatureToAPI(featureGeoJSON) {
    return new Promise((resolve, reject) => {
        var apiUrl = geoServerURL + '/export';
        fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(featureGeoJSON)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response;
        })
        .then(data => {
            resolve(data);
        })
        .catch(error => {
            console.error('Error sending feature to API:', error);
            reject(error);
        });
    });
}


function countIntersectingPoints(layer, polygon) {
    var intersectingPoints = 0;
    layer.eachFeature(function (point) {
        if (turf.booleanPointInPolygon(point.toGeoJSON().geometry, polygon.toGeoJSON().geometry)) {
            intersectingPoints++;
        }
    });
    return intersectingPoints;
}

function featureServiceLayerToGeoJSON(featureServiceLayer) {
    var geojsonObject = {
        type: "FeatureCollection",
        features: []
    };
    
    featureServiceLayer.eachFeature(function(layer) {
        var properties = layer.feature.properties;
        var geometry = layer.feature.geometry;
    
        var feature = {
            type: "Feature",
            properties: properties,
            geometry: geometry
        };
    
        geojsonObject.features.push(feature);
    });
    
    return geojsonObject
}

downloadBlob = (blob) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
}

async function sendAndDownloadFeatures(combinedJSON) {
    try {
        const response = await sendFeatureToAPI(combinedJSON);
        if (response) {
            const blob = await response.blob();
            downloadBlob(blob);
        } else {
            console.log("Response is empty");
        }
    } catch (error) {
        console.error("Error:", error);
    }
}

function downloadReport() {
    var wellBoresGeoJSON = featureServiceLayerToGeoJSON(wellBores);
    var resourceConsentsGeoJSON = featureServiceLayerToGeoJSON(resourceConsents);

    var polygon = clickedFeature.toGeoJSON();

    var intersectingWellBores = wellBoresGeoJSON.features.filter(function(feature) {
        var pointCoords = feature.geometry.coordinates
        return turf.booleanPointInPolygon(pointCoords, polygon);
    });

    var intersectingResourceConsents = resourceConsentsGeoJSON.features.filter(function(feature) {
        return turf.booleanPointInPolygon(feature.geometry.coordinates, polygon);
    });

    var combinedJSON = {
        'well_bores': intersectingWellBores,
        'resource_consents': intersectingResourceConsents,
        'centroid':turf.centroid(polygon).geometry.coordinates,
        'property_titles':[polygon],
        'zoom':map.getZoom(),
        
        // change me
        'client': 'bored_yet' 
    };

    sendAndDownloadFeatures(combinedJSON)
    
}

// add points
var wellIconOptions = {
    icon: 'droplet',
    backgroundColor: '#1d65a6',
    textColor:'white',
    iconShape:'marker',
    borderColor:'transparent'
}
var wellBores = L.esri.featureLayer({
    url:"https://mapping.gw.govt.nz/arcgis/rest/services/GW/Resource_Consents_P/MapServer/1",
    onEachFeature:createAttributePopup,
    pointToLayer: function (geojson, latlng) {
    return L.marker(latlng, {
        icon: L.BeautifyIcon.icon(wellIconOptions)
    });
    }
}
).addTo(map);

var resourceConsentIconOptions = {
    icon: 'file-lines',
    backgroundColor: '#292929',
    textColor:'white',
    iconShape:'marker',
    borderColor:'transparent'
}
var resourceConsents = L.esri.featureLayer({
    url:"https://mapping.gw.govt.nz/arcgis/rest/services/GW/Resource_Consents_P/MapServer/0",
    onEachFeature:createAttributePopup,
    pointToLayer: function (geojson, latlng) {
    return L.marker(latlng, {
        icon: L.BeautifyIcon.icon(resourceConsentIconOptions)
    });
    }
}
).addTo(map);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

map.on('moveend', function () {
    const mapCenter = map.getBounds().getCenter();
    const point = [mapCenter.lng, mapCenter.lat]
    const pointGeoJSON = turf.point(point);
    const titleLayerID = '50804'
    let url = geoServerURL + '/linz_vector?' + new URLSearchParams({
        "x":pointGeoJSON.geometry.coordinates[0],
        "y":pointGeoJSON.geometry.coordinates[1],
        "layer":titleLayerID
    })

    fetch(url)
        .then(response => response.json())
        .then(data => {
            if (propertyTitlesLayer) {
                if (map.hasLayer(propertyTitlesLayer)) {
                    map.removeLayer(propertyTitlesLayer);
                }
            }

            var features = data.vectorQuery.layers[Number(titleLayerID)].features;

            propertyTitlesLayer = L.geoJSON(features, {
                onEachFeature: function (feature, layer) {
                    layer.on('click', function (e) {
                        clickedFeature = e.target;
                        var intersectingWellBores = countIntersectingPoints(wellBores, clickedFeature);
                        var intersectingResourceConsents = countIntersectingPoints(resourceConsents, clickedFeature);
                
                        var popupContent = "Intersecting Well Bores: " + intersectingWellBores + "<br>" +
                                           "Intersecting Resource Consents: " + intersectingResourceConsents + "<br>" +
                                           "<button onclick='downloadReport()'>Download report</button>";
                        layer.bindPopup(popupContent).openPopup();
                    });
                }
            }).addTo(map);
        })
        .catch(error => {
            console.error('Error fetching property titles:', error);
        });
});