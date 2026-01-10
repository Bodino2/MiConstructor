import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb, defaultTargetPlatform, TargetPlatform;
import 'package:http/http.dart' as http;
import 'package:geolocator/geolocator.dart';
import 'dart:convert';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'NextGen Logistics Driver',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
      ),
      home: const MyHomePage(title: 'Driver Location Tracker'),
    );
  }
}

class MyHomePage extends StatefulWidget {
  const MyHomePage({super.key, required this.title});

  final String title;

  @override
  State<MyHomePage> createState() => _MyHomePageState();
}

class _MyHomePageState extends State<MyHomePage> {
  String _locationStatus = 'Getting location...';
  final String _plateNumber = 'B-123-NGX';

  String get _backendUrl {
    // Always target the LAN gateway so physical devices reach the backend.
    return 'http://192.168.1.141:3000/update-location';
  }

  @override
  void initState() {
    super.initState();
    _startLocationTracking();
  }

  void _startLocationTracking() async {
    try {
      if (kIsWeb) {
        setState(() {
          _locationStatus = 'GPS Ready! Press button to send location.';
        });
        return;
      }

      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        setState(() {
          _locationStatus = 'Location service is disabled.';
        });
        return;
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.deniedForever) {
        setState(() {
          _locationStatus = 'Location permissions permanently denied';
        });
        return;
      }

      setState(() {
        _locationStatus = 'GPS Ready! Press button to send location.';
      });
      print("[GPS] Location service enabled and permission granted");
    } catch (e) {
      setState(() {
        _locationStatus = 'Error: $e';
      });
      print("[ERROR] Init: $e");
    }
  }

  Future<void> _sendLocationToBackend() async {
    try {
      print("[LOCATION] Getting current position...");
      
      Position position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.best,
          timeLimit: Duration(seconds: 10),
        ),
      );
      
      print("[LOCATION] Got position: ${position.latitude}, ${position.longitude}");

      final url = Uri.parse(_backendUrl);
      final body = jsonEncode({
        "plate_number": _plateNumber,
        "lat": position.latitude,
        "lng": position.longitude,
      });
      
      print("[HTTP] Sending POST to $_backendUrl with body: $body");

      final response = await http.post(
        url,
        headers: {"Content-Type": "application/json"},
        body: body,
      ).timeout(
        const Duration(seconds: 5),
        onTimeout: () => throw "Server timeout",
      );

      print("[HTTP] Response: ${response.statusCode} - ${response.body}");

      setState(() {
        _locationStatus = 'Success! Status: ${response.statusCode}\n'
            'Lat: ${position.latitude.toStringAsFixed(4)}\n'
            'Lng: ${position.longitude.toStringAsFixed(4)}';
      });
    } catch (e) {
      print("[ERROR] $e");
      setState(() {
        _locationStatus = 'Error: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
        title: Text(widget.title),
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('Driver Location Tracker'),
            const SizedBox(height: 20),
            Text(
              _locationStatus,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _sendLocationToBackend,
        tooltip: 'Send Location',
        child: const Icon(Icons.location_on),
      ),
    );
  }
}
