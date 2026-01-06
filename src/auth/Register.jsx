import { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');

  // optional fields
  const [goals, setGoals] = useState('');
  const [healthNotes, setHealthNotes] = useState('');
  const [trainingNotes, setTrainingNotes] = useState('');

  async function register() {
    if (!name || !surname || !email || !password || !phone || !dob) {
      alert('Popunite sva obavezna polja');
      return;
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      await setDoc(doc(db, 'users', cred.user.uid), {
        name,
        surname,
        email,
        phone,
        dob: Timestamp.fromDate(new Date(dob)), // Firestore Timestamp
        role: 'client',
        active: true,

        goals: goals || '',
        healthNotes: healthNotes || '',
        trainingNotes: trainingNotes || '',

        createdAt: Timestamp.fromDate(new Date())
      });

      alert('Registracija uspešna');
    } catch (err) {
      console.error(err);
      alert('Greška pri registraciji');
    }
  }

  return (
    <div>
      <h2>Registracija</h2>

      <input placeholder="Ime *" value={name} onChange={e => setName(e.target.value)} />
      <input placeholder="Prezime *" value={surname} onChange={e => setSurname(e.target.value)} />
      <input placeholder="Email *" value={email} onChange={e => setEmail(e.target.value)} />
      <input type="password" placeholder="Lozinka *" value={password} onChange={e => setPassword(e.target.value)} />
      <input placeholder="Telefon *" value={phone} onChange={e => setPhone(e.target.value)} />
      <label>Datum rođenja *</label>
      <input type="date" value={dob} onChange={e => setDob(e.target.value)} />

      <hr />

      <textarea placeholder="Opšti ciljevi (opciono)" value={goals} onChange={e => setGoals(e.target.value)} />
      <textarea placeholder="Zdravstvene napomene (opciono)" value={healthNotes} onChange={e => setHealthNotes(e.target.value)} />
      <textarea placeholder="Trenažne napomene (opciono)" value={trainingNotes} onChange={e => setTrainingNotes(e.target.value)} />

      <button onClick={register}>Registruj se</button>
    </div>
  );
}
