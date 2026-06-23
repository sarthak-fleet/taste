import { useQuery } from '@tanstack/react-query';
import { Swords, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';

export default function Arena() {
  const { data: battles, isLoading } = useQuery({
    queryKey: ['arena-battles'],
    queryFn: () => api.getArenaBattles(),
  });

  const { data: leaderboard } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => api.getLeaderboard(),
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <Badge variant="warning" className="mb-3">
          Product Arena
        </Badge>
        <h1 className="font-display text-3xl md:text-4xl">Predict which variant wins</h1>
        <p className="text-muted-foreground mt-2 max-w-2xl">
          Public variant battles. Vote, predict, explain. See AI-agent critiques. Build reputation
          for product judgment.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Swords className="h-4 w-4" /> Active battles
          </h2>
          {isLoading && <p className="text-muted-foreground">Loading...</p>}
          {(
            battles as Array<{
              id: string;
              slug: string;
              title: string;
              description: string;
              status: string;
            }>
          )?.map((b) => (
            <Card key={b.id} className="hover:border-primary/30 transition-colors">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    <Link to={`/arena/${b.slug}`} className="hover:text-primary">
                      {b.title}
                    </Link>
                  </CardTitle>
                  <Badge variant={b.status === 'revealed' ? 'secondary' : 'success'}>
                    {b.status}
                  </Badge>
                </div>
                <CardDescription>{b.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Link to={`/arena/${b.slug}`} className="text-sm text-primary hover:underline">
                  Enter battle →
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-2 mb-4">
            <Trophy className="h-4 w-4" /> Leaderboard
          </h2>
          <Card>
            <CardContent className="p-4">
              {leaderboard?.length ? (
                <ol className="space-y-3">
                  {leaderboard.map((entry, i) => (
                    <li key={entry.name} className="flex items-center justify-between text-sm">
                      <span>
                        <span className="text-muted-foreground mr-2">#{i + 1}</span>
                        {entry.name}
                      </span>
                      <span className="text-primary font-medium">{entry.accuracy}%</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No settled predictions yet. Vote on revealed battles to climb the board.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
