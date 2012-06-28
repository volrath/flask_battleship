from flask import Flask, render_template
app = Flask(__name__)

@app.route('/')
def battleship():
    return render_template('battleship.html')

if __name__ == '__main__':
    app.run(debug=True)