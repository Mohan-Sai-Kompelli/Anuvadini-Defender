import React from 'react';
import { StyleSheet, View, Image,Dimensions, Linking, TouchableOpacity, Text ,} from 'react-native';
const { width } = Dimensions.get('window');
// import CustomText from './CustomText';
import { SafeAreaView } from 'react-native-safe-area-context';


export function Footer() {
  const poweredByText = 'Powered By';
  return (
<SafeAreaView  edges={['bottom']} style={{backgroundColor: '#fff'}}>
    <View style={styles.footer}>
      <View style={styles.topRow}>  
        <View style={styles.poweredByContainer}>
          <Text style={styles.poweredByText}>{poweredByText}</Text>
          <Image
            source={require('../assets/anuvadini-logo-removebg-preview.png')}
            style={styles.anuvadiniLogo}
          />
        </View>
        <View style={{width:"50%", }}>
        <Image
          source={require('../assets/MakeInIndia.png')}
          style={styles.anuvadiniLogo}
        />
        </View>
        <TouchableOpacity style={{textAlign:"center", alignSelf:"center"}} onPress={() => Linking.openURL('https://anuvadini.aicte-india.org')}>
          <Text style={styles.footerText}>anuvadini.aicte-india.org</Text>
        </TouchableOpacity>
      </View>
      
    </View>
  </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  footer: {    
    backgroundColor: '#fff',
    alignItems: 'center',
    width: width, 
    boxShadow: '0px -1px 1px rgba(0, 0, 0, 0.1)',
    paddingTop: 0,    
    height: 40,
  },
  footerText: {
    color: '#212121',
    fontSize: 14,
    marginLeft: -100,
    flexShrink: 1,
    paddingHorizontal: 5,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    width: '100%',
  },
  poweredByContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    // flex: 1,
    // marginRight: 10,
  },
  poweredByText: {
    fontSize: 10,
    color: '#333333',
    fontWeight: 'bold',
    flexShrink: 1,
  },
  anuvadiniLogo: {
    width: 80,
    height: 25,
    resizeMode: 'contain',
  },
 
}); 