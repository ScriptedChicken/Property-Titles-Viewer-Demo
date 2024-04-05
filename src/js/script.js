// variables
var propertyTitlesLayer;
var resourceConsentsLayer;
var geoServerURL = 'http://10.6.4.20:5000'
var map = L.map('map').setView([-41.2865, 174.7762], 20);

// add controls
const search = new GeoSearch.GeoSearchControl({
    provider: new GeoSearch.OpenStreetMapProvider(),
});
console.log(search)

map.addControl(search);

// functions
function createAttributePopup (feature, layer) {
    var popupContent = "<table>";
    for (var prop in feature.properties) {
        if (feature.properties.hasOwnProperty(prop)) {
            popupContent += "<tr><th>" + prop + "</th><td>" + feature.properties[prop] + "</td></tr>";
        }
    }
    popupContent += "</table>";
    layer.bindPopup(popupContent);
}

function removeLayerIfExists(layer) {
    if (map.hasLayer(layer)) {
        map.removeLayer(layer);
    }
}

function sendFeatureToAPI(featureGeoJSON) {
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
        return response.json();
    })
    .then(data => {
        if (resourceConsentsLayer) {
                removeLayerIfExists(resourceConsentsLayer)
            }
        console.log(data)
        var features = data.features;
        resourceConsentsLayer = L.geoJSON(features).addTo(map);
        console.log('Added resource consents layer')
    })
    .catch(error => {
        console.error('Error sending feature to API:', error);
    });
}

function countIntersectingPoints(layer, polygon) {
    var intersectingPoints = 0;
    console.log(layer)
    layer.eachFeature(function (point) {
        if (turf.booleanPointInPolygon(point.toGeoJSON().geometry, polygon.toGeoJSON().geometry)) {
            intersectingPoints++;
        }
    });
    return intersectingPoints;
}

// add points
var wellMarker = L.AwesomeMarkers.icon({
    icon: 'droplet',
    prefix: 'fa',
    markerColor: 'blue'
});
console.log(wellMarker)
var wellBores = L.esri.featureLayer({
    url:"https://mapping.gw.govt.nz/arcgis/rest/services/GW/Resource_Consents_P/MapServer/1",
    onEachFeature:createAttributePopup,
    pointToLayer: function (geojson, latlng) {
    return L.marker(latlng, {
        icon: wellMarker
    });
    }
}
).addTo(map);

var resourceConsentMarker = L.AwesomeMarkers.icon({
    icon: 'file-lines', 
    prefix: 'fa', 
    markerColor: 'gray'
});
var resourceConsents = L.esri.featureLayer({
    url:"https://mapping.gw.govt.nz/arcgis/rest/services/GW/Resource_Consents_P/MapServer/0",
    onEachFeature:createAttributePopup,
    pointToLayer: function (geojson, latlng) {
    return L.marker(latlng, {
        icon: resourceConsentMarker
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
            console.log(features)

            propertyTitlesLayer = L.geoJSON(features, {
                onEachFeature: function (feature, layer) {
                    layer.on('click', function (e) {
                        var intersectingWellBores = countIntersectingPoints(wellBores, e.target);
                        var intersectingResourceConsents = countIntersectingPoints(resourceConsents, e.target);
                
                        // Create popup content
                        var popupContent = "Intersecting Well Bores: " + intersectingWellBores + "<br>" +
                                           "Intersecting Resource Consents: " + intersectingResourceConsents;
                
                        // Display popup
                        layer.bindPopup(popupContent).openPopup();
                    });
                }
            }).addTo(map);
        })
        .catch(error => {
            console.error('Error fetching property titles:', error);
        });
});