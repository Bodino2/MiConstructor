import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;

class ClientTrackingMap extends StatefulWidget {
  final String orderId;
  final String? encodedPolyline;
  final String? duration;
  final String? distance;

  const ClientTrackingMap({
    super.key,
    required this.orderId,
    this.encodedPolyline,
    this.duration,
    this.distance,
  });

  @override
  State<ClientTrackingMap> createState() => _ClientTrackingMapState();
}

class _ClientTrackingMapState extends State<ClientTrackingMap> {
  GoogleMapController? mapController;
  Marker? truckMarker;
  Set<Polyline> polylines = {};
  late IO.Socket socket;

  @override
  void initState() {
    super.initState();
    socket = IO.io('https://api.nextgenlogistic.com', IO.OptionBuilder().setTransports(['websocket']).build());

    socket.on('order-${widget.orderId}', (data) {
      final lat = (data['lat'] as num).toDouble();
      final lng = (data['lng'] as num).toDouble();
      final pos = LatLng(lat, lng);
      setState(() {
        truckMarker = Marker(
          markerId: const MarkerId('truck'),
          position: pos,
        );
      });
      mapController?.animateCamera(CameraUpdate.newLatLng(pos));
    });

    _maybeLoadRoute();
  }

  @override
  void dispose() {
    socket.dispose();
    mapController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        GoogleMap(
          initialCameraPosition: const CameraPosition(
            target: LatLng(0, 0),
            zoom: 5,
          ),
          markers: truckMarker != null ? {truckMarker!} : {},
          polylines: polylines,
          onMapCreated: (controller) => mapController = controller,
          myLocationButtonEnabled: false,
          zoomControlsEnabled: true,
        ),
        if (widget.duration != null && widget.distance != null)
          Positioned(
            left: 12,
            right: 12,
            top: 12,
            child: Card(
              elevation: 3,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                child: Text('ETA: ${widget.duration} | Distance: ${widget.distance}'),
              ),
            ),
          ),
      ],
    );
  }

  void _maybeLoadRoute() {
    if (widget.encodedPolyline == null || widget.encodedPolyline!.isEmpty) return;
    final points = _decodePolyline(widget.encodedPolyline!);
    if (points.isEmpty) return;

    setState(() {
      polylines = {
        Polyline(
          polylineId: const PolylineId('route'),
          points: points,
          width: 5,
          color: Colors.blueAccent,
        ),
      };
    });
  }

  List<LatLng> _decodePolyline(String encoded) {
    final List<LatLng> points = [];
    int index = 0;
    int lat = 0;
    int lng = 0;

    while (index < encoded.length) {
      int b;
      int shift = 0;
      int result = 0;

      do {
        b = encoded.codeUnitAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);

      final dlat = (result & 1) != 0 ? ~(result >> 1) : (result >> 1);
      lat += dlat;

      shift = 0;
      result = 0;

      do {
        b = encoded.codeUnitAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);

      final dlng = (result & 1) != 0 ? ~(result >> 1) : (result >> 1);
      lng += dlng;

      points.add(LatLng(lat / 1e5, lng / 1e5));
    }

    return points;
  }
}
