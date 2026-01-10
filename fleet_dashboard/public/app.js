// Initialize map
let map;
let markers = {};
let trucks = [];

function initMap() {
    // Center on USA (default view)
    map = L.map('map').setView([39.8283, -98.5795], 4);

    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    fetchTrucks();
    // Refresh every 10 seconds
    setInterval(fetchTrucks, 10000);
}

function fetchTrucks() {
    fetch('/api/trucks')
        .then(response => response.json())
        .then(data => {
            trucks = data;
            updateMap();
            updateTrucksList();
        })
        .catch(error => console.error('Error fetching trucks:', error));
}

function updateMap() {
    trucks.forEach(truck => {
        const { plate_number, latitude, longitude, updated_at } = truck;

        if (markers[plate_number]) {
            // Update existing marker
            markers[plate_number].setLatLng([latitude, longitude]);
        } else {
            // Create new marker
            const marker = L.marker([latitude, longitude], {
                title: plate_number
            }).addTo(map);

            const popupContent = `
                <div style="width: 200px;">
                    <strong>${plate_number}</strong><br>
                    <small>📍 ${latitude.toFixed(6)}, ${longitude.toFixed(6)}</small><br>
                    <small>🕐 ${new Date(updated_at).toLocaleTimeString()}</small>
                </div>
            `;

            marker.bindPopup(popupContent);
            markers[plate_number] = marker;
        }
    });
}

function updateTrucksList() {
    const trucksList = document.getElementById('trucks-list');
    
    if (trucks.length === 0) {
        trucksList.innerHTML = '<p style="padding: 20px; text-align: center; color: #999;">No trucks available</p>';
        return;
    }

    trucksList.innerHTML = trucks.map(truck => `
        <div class="truck-item" onclick="focusTruck('${truck.plate_number}')">
            <div class="truck-plate">🚚 ${truck.plate_number}</div>
            <div class="truck-coords">
                ${truck.latitude.toFixed(6)}° N<br>
                ${truck.longitude.toFixed(6)}° W
            </div>
            <div class="truck-time">
                Updated: ${new Date(truck.updated_at).toLocaleTimeString()}
            </div>
        </div>
    `).join('');
}

function focusTruck(plateName) {
    const truck = trucks.find(t => t.plate_number === plateName);
    if (truck) {
        map.setView([truck.latitude, truck.longitude], 12);
        markers[plateName].openPopup();
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initMap);
