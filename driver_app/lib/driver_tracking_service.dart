import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_background_service/flutter_background_service.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;

class DriverTrackingService {
  Timer? timer;
  final FirebaseFirestore _db = FirebaseFirestore.instance;

  void startTracking(String orderId) {
    timer = Timer.periodic(const Duration(seconds: 10), (_) async {
      Position pos = await Geolocator.getCurrentPosition();
      await _sendLocation(orderId, pos);
    });
  }

  void stop() => timer?.cancel();

  void attachBackgroundListener(FlutterBackgroundService service, String orderId) {
    service.on('track').listen((event) async {
      final pos = await Geolocator.getCurrentPosition();
      await _sendLocation(orderId, pos);
    });
  }

  Future<void> _sendLocation(String orderId, Position pos) async {
    await http.post(
      Uri.parse('https://api.nextgenlogistic.com/tracking/update'),
      body: {
        'orderId': orderId,
        'lat': pos.latitude.toString(),
        'lng': pos.longitude.toString(),
      },
    );

    await _db.collection('tracking').doc(orderId).set({
      'lat': pos.latitude,
      'lng': pos.longitude,
      'timestamp': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }
}
