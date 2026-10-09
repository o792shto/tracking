import { Component, type ErrorInfo, type ReactNode } from 'react';
import { STORAGE_KEY } from '../store/game';
import { removeKey } from '../store/storage';

interface State {
  error: Error | null;
}

/** 画面の描画で例外が出たとき、真っ黒にせずエラーの内容と復旧ボタンを出す */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main className="screen crash" role="alert">
        <h1>エラーで画面を表示できませんでした</h1>
        <p>下の内容をそのまま（またはスクリーンショットで）知らせてください。</p>
        <pre>
          {String(error.stack ?? error)}
          {'\n\n'}
          {navigator.userAgent}
        </pre>
        <div className="crash-actions">
          <button type="button" className="primary" onClick={() => location.reload()}>
            再読み込み
          </button>
          <button
            type="button"
            onClick={() => {
              removeKey(STORAGE_KEY);
              location.reload();
            }}
          >
            保存データを消して再開
          </button>
        </div>
      </main>
    );
  }
}
