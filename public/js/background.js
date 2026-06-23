import * as THREE from 'three';

/**
 * シンプルな白背景（白紙デザイン）
 * 星・グリッド・霧は使用しない
 */
export function createBackground(scene, vrMode = false) {
  if (vrMode) return { update: () => {}, setVisible: () => {} };

  // 薄いグレーの床面だけ配置
  const floorGeo = new THREE.PlaneGeometry(40, 40);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xf0f0f0,
    roughness: 0.8,
    metalness: 0.0,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.0;
  floor.receiveShadow = true;
  scene.add(floor);

  return {
    update(_t) {},
    setVisible(v) { floor.visible = v; },
    setFloorY(y)  { floor.position.y = y; },
  };
}
