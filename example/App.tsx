import React, { Component } from 'react';
import { Text, TextInput, View } from 'react-native';
import ScrollBottomSheet, {
  BSTouchableNativeFeedback,
} from 'react-native-scroll-bottom-sheet';

class App extends Component {
  snapPoints = ['35%', '70%'];

  footerComponent() {
    return (
      <BSTouchableNativeFeedback>
        <View
          style={{
            flex: 1,
            height: 35,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'green',
          }}
        >
          <Text style={{ textAlign: 'center', color: '#fff', fontSize: 17 }}>
            Footer
          </Text>
        </View>
      </BSTouchableNativeFeedback>
    );
  }

  render() {
    return (
      <View style={{ flex: 1, backgroundColor: '#dedede' }}>
        <ScrollBottomSheet
          componentType="ScrollView"
          snapPoints={this.snapPoints}
          initialSnapIndex={1}
          keyboardAwared={true}
          keyboardTopOffset={16}
          renderFooter={this.footerComponent}
          renderHandle={() => (
            <View
              style={{
                width: '100%',
                height: 30,
                backgroundColor: '#aaa',
                justifyContent: 'center',
                alignItems: 'center',
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
              }}
            >
              <View
                style={{
                  width: 50,
                  height: 4,
                  backgroundColor: '#777',
                  borderRadius: 8,
                }}
              ></View>
            </View>
          )}
        >
          <View
            style={{
              flex: 500,
              height: 250,
              backgroundColor: '#333',
              padding: 12,
            }}
          >
            <Text style={{ color: '#fff' }}>Hi this is a bottom sheet</Text>
            <TextInput
              placeholder="Testing Input"
              style={{
                color: '#fff',
                height: 35,
                borderWidth: 1,
                marginTop: 8,
                borderColor: '#fff',
                paddingHorizontal: 8,
              }}
            />
          </View>
        </ScrollBottomSheet>
      </View>
    );
  }
}

export default App;
