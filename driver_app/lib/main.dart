import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb, defaultTargetPlatform, TargetPlatform;
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'NextGen Logistics',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue, brightness: Brightness.light),
        useMaterial3: true,
      ),
      home: const LoginPage(),
    );
  }
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  bool _isLoading = false;

  String get _loginUrl {
    return 'http://192.168.1.141:3000/api/auth/login';
  }

  Future<void> _handleLogin() async {
    setState(() => _isLoading = true);
    try {
      final response = await http
          .post(
            Uri.parse(_loginUrl),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'email': _emailController.text.trim(),
              'password': _passwordController.text,
            }),
          )
          .timeout(const Duration(seconds: 8));

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        final token = data['access_token'] ?? data['token'];

        if (token == null || (token is String && token.isEmpty)) {
          _showError('Login reusit dar token lipsa');
          return;
        }

        if (mounted) {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute(builder: (_) => TrackingPage(token: token as String)),
          );
        }
      } else {
        final body = response.body.isNotEmpty ? jsonDecode(response.body) : {};
        final message = body['error'] ?? body['message'] ?? 'Login esuat';
        _showError(message.toString());
      }
    } catch (e) {
      _showError('Eroare de conexiune: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.local_shipping, size: 80, color: Colors.blue),
            const SizedBox(height: 12),
            const Text('NextGen Logistics', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
            const SizedBox(height: 32),
            TextField(
              controller: _emailController,
              decoration: const InputDecoration(labelText: 'Email', border: OutlineInputBorder()),
              keyboardType: TextInputType.emailAddress,
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _passwordController,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Parola', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 24),
            _isLoading
                ? const CircularProgressIndicator()
                : ElevatedButton(
                    style: ElevatedButton.styleFrom(minimumSize: const Size(double.infinity, 50)),
                    onPressed: _handleLogin,
                    child: const Text('Autentificare sofer'),
                  ),
          ],
        ),
      ),
    );
  }
}

class TrackingPage extends StatefulWidget {
  final String token;
  const TrackingPage({super.key, required this.token});

  @override
  State<TrackingPage> createState() => _TrackingPageState();
}

class _TrackingPageState extends State<TrackingPage> {
  String _locationStatus = 'GPS Ready';
  bool _sending = false;
  final String _plateNumber = 'ABC-123';

  String get _backendUrl {
    return 'http://192.168.1.141:3000/update-location';
  }

  @override
  void initState() {
    super.initState();
    _ensurePermissions();
  }

  Future<void> _ensurePermissions() async {
    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        setState(() => _locationStatus = 'Location service is disabled');
        return;
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.deniedForever) {
        setState(() => _locationStatus = 'Location permissions permanently denied');
        return;
      }

      setState(() => _locationStatus = 'GPS ready. Tap to send location.');
    } catch (e) {
      setState(() => _locationStatus = 'Permission error: $e');
    }
  }

  Future<void> _sendLocationToBackend() async {
    if (_sending) return;
    setState(() => _sending = true);

    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.best),
      );

      final response = await http.post(
        Uri.parse(_backendUrl),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${widget.token}',
        },
        body: jsonEncode({
          'plate_number': _plateNumber,
          'lat': position.latitude,
          'lng': position.longitude,
        }),
      );

      setState(() {
        _locationStatus = 'Locatie trimisa (status ${response.statusCode})\n'
            'Lat: ${position.latitude.toStringAsFixed(4)} Lng: ${position.longitude.toStringAsFixed(4)}';
      });
    } catch (e) {
      setState(() => _locationStatus = 'Error: $e');
    } finally {
      setState(() => _sending = false);
    }
  }

  void _logout() {
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const LoginPage()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('NextGen Tracking'),
        actions: [IconButton(onPressed: _logout, icon: const Icon(Icons.logout))],
      ),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Masina: $_plateNumber', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 16),
            Text(
              _locationStatus,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const Spacer(),
            ElevatedButton.icon(
              onPressed: _sending ? null : _sendLocationToBackend,
              icon: const Icon(Icons.location_on),
              label: Text(_sending ? 'Se trimite...' : 'Trimite locatia'),
              style: ElevatedButton.styleFrom(minimumSize: const Size(double.infinity, 56)),
            ),
          ],
        ),
      ),
    );
  }
}
