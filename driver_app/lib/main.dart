import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:geolocator/geolocator.dart';
import 'dart:convert';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  // This widget is the root of your application.
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

  // This widget is the home page of your application. It is stateful, meaning
  // that it has a State object (defined below) that contains fields that affect
  // how it looks.

  // This class is the configuration for the state. It holds the values (in this
  // case the title) provided by the parent (in this case the App widget) and
  // used by the build method of the State. Fields in a Widget subclass are
  // always marked "final".

  final String title;

  @override
  State<MyHomePage> createState() => _MyHomePageState();
}

class _MyHomePageState extends State<MyHomePage> {
  int _counter = 0;
  String _locationStatus = 'Getting location...';
  final String _backendUrl = 'http://10.0.2.2:3000/update-location';
  final String _plateNumber = 'ABC-123'; // Change to actual truck plate number

  @override
  void initState() {
    super.initState();
    _startLocationTracking();
  }

  void _startLocationTracking() async {
    try {
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
        if (permission == LocationPermission.denied) {
          setState(() {
            _locationStatus = 'Location permissions are denied';
          });
          return;
        }
      }

      if (permission == LocationPermission.deniedForever) {
        setState(() {
          _locationStatus = 'Location permissions are permanently denied';
        });
        return;
      }

      // Start continuous location updates
      Geolocator.getPositionStream(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.best,
          distanceFilter: 10, // Update every 10 meters
        ),
      ).listen((Position position) {
        _sendLocationToBackend();
      });
    } catch (e) {
      setState(() {
        _locationStatus = 'Error: $e';
      });
    }
  }

  Future<void> _sendLocationToBackend() async {
    // 1. CERE PERMISIUNEA (Aceasta va afișa pop-up-ul pe telefon)
    LocationPermission permission = await Geolocator.requestPermission();

    if (permission == LocationPermission.whileInUse || permission == LocationPermission.always) {
      try {
        // 2. IA LOCAȚIA REALĂ
        Position position = await Geolocator.getCurrentPosition();
        
        // 3. TRIMITE LA SERVER (Folosim 10.0.2.2 acum că Firewall-ul e deschis)
        final response = await http.post(
          Uri.parse('http://10.0.2.2:3000/update-location'),
          headers: {"Content-Type": "application/json"},
          body: jsonEncode({
            "plate_number": "B-123-NGX",
            "lat": position.latitude,
            "lng": position.longitude,
          }),
        );

        setState(() {
          _locationStatus = 'Serverul a răspuns cu succes: ${response.statusCode}';
        });
        print("Serverul a răspuns cu succes: ${response.statusCode}");
      } catch (e) {
        setState(() {
          _locationStatus = 'Eroare la obținerea locației: $e';
        });
        print("Eroare la obținerea locației: $e");
      }
    } else {
      setState(() {
        _locationStatus = 'Utilizatorul a refuzat accesul la GPS.';
      });
      print("Utilizatorul a refuzat accesul la GPS.");
    }
  }

  void _incrementCounter() {
    setState(() {
      _counter++;
    });
  }

  @override
  Widget build(BuildContext context) {
    // This method is rerun every time setState is called, for instance as done
    // by the _incrementCounter method above.
    //
    // The Flutter framework has been optimized to make rerunning build methods
    // fast, so that you can just rebuild anything that needs updating rather
    // than having to individually change instances of widgets.
    return Scaffold(
      appBar: AppBar(
        // TRY THIS: Try changing the color here to a specific color (to
        // Colors.amber, perhaps?) and trigger a hot reload to see the AppBar
        // change color while the other colors stay the same.
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
        // Here we take the value from the MyHomePage object that was created by
        // the App.build method, and use it to set our appbar title.
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
            const SizedBox(height: 20),
            Text(
              'Button presses: $_counter',
              style: Theme.of(context).textTheme.headlineMedium,
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
